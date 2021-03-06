import {LogCategory, logDebug, logError, logInfo, logTrace, logWarn} from "../log";
import {guid} from "../crypto/uid";
import {Settings, StaticSettings} from "../settings";
import * as loader from "tc-loader";
import {formatMessage, formatMessageString} from "../ui/frames/chat";

export interface TranslationKey {
    message: string;
    line?: number;
    character?: number;
    filename?: string;
}

export interface Translation {
    key: TranslationKey;
    translated: string;
    flags?: string[];
}

export interface Contributor {
    name: string;
    email: string;
}

export interface TranslationFile {
    path: string;
    full_url: string;

    translations: Translation[];
}

export interface RepositoryTranslation {
    key: string;
    path: string;

    country_code: string;
    name: string;
    contributors: Contributor[];
}

export interface TranslationRepository {
    unique_id: string;
    url: string;
    name?: string;
    contact?: string;
    translations?: RepositoryTranslation[];
    load_timestamp?: number;
}

let translations: Translation[] = [];
let translateCache: { [key:string]: string; } = {};
export function tr(message: string, key?: string) : string {
    const sloppy = translateCache[message];
    if(sloppy) {
        return sloppy;
    }

    logTrace(LogCategory.I18N, "Translating \"%s\". Default: \"%s\"", key, message);

    let translated;
    for(const translation of translations) {
        if(translation.key.message === message) {
            translated = translation.translated;
            break;
        }
    }

    if(typeof translated === "string") {
        translateCache[message] = translated;
    } else {
        logDebug(LogCategory.I18N, "Missing translation for \"%s\".", message);
        translateCache[message] = translated = message;
    }
    return translated;
}

export function tra(message: string, ...args: (string | number | boolean)[]) : string;
export function tra(message: string, ...args: any[]) : JQuery[];
export function tra(message: string, ...args: any[]) : any {
    message = /* @tr-ignore */ tr(message);
    for(const element of args) {
        if(element === null) {
            continue;
        }

        switch (typeof element) {
            case "boolean":
            case "number":
            case "string":
            case "undefined":
                continue;

            default:
                return formatMessage(message, ...args);
        }
    }
    if(message.indexOf("{:") !== -1)
        return formatMessage(message, ...args);
    return formatMessageString(message, ...args);
}

export function traj(message: string, ...args: any[]) : JQuery[] {
    return tra(message, ...args, {});
}

async function load_translation_file(url: string, path: string) : Promise<TranslationFile> {
    return new Promise<TranslationFile>((resolve, reject) => {
        $.ajax({
            url: url,
            async: true,
            success: result => {
                try {
                    const file = (typeof(result) === "string" ? JSON.parse(result) : result) as TranslationFile;
                    if(!file) {
                        reject("Invalid json");
                        return;
                    }

                    file.full_url = url;
                    file.path = path;

                    //TODO: Validate file
                    resolve(file);
                } catch(error) {
                    logWarn(LogCategory.I18N, tr("Failed to load translation file %s. Failed to parse or process json: %o"), url, error);
                    reject(tr("Failed to process or parse json!"));
                }
            },
            error: (xhr, error) => {
                reject(tr("Failed to load file: ") + error);
            }
        })
    });
}

export function load_file(url: string, path: string) : Promise<void> {
    return load_translation_file(url, path).then(async result => {
        /* TODO: Improve this test?!*/
        try {
            tr("Dummy translation test");
        } catch(error) {
            throw "dummy test failed";
        }

        logInfo(LogCategory.I18N, tr("Successfully initialized up translation file from %s"), url);
        translations = result.translations;
    }).catch(error => {
        logWarn(LogCategory.I18N, tr("Failed to load translation file from \"%s\". Error: %o"), url, error);
        return Promise.reject(error);
    });
}

async function load_repository0(repo: TranslationRepository, reload: boolean) {
    if(!repo.load_timestamp || repo.load_timestamp < 1000 || reload) {
        const info_json = await new Promise((resolve, reject) => {
            $.ajax({
                url: repo.url + "/info.json",
                async: true,
                cache: !reload,
                success: result => {
                    const file = (typeof(result) === "string" ? JSON.parse(result) : result) as TranslationFile;
                    if(!file) {
                        reject("Invalid json");
                        return;
                    }

                    resolve(file);
                },
                error: (xhr, error) => {
                    reject(tr("Failed to load file: ") + error);
                }
            })
        });

        Object.assign(repo, info_json);
    }

    if(!repo.unique_id)
        repo.unique_id = guid();

    repo.translations = repo.translations || [];
    repo.load_timestamp = Date.now();
}

export async function load_repository(url: string) : Promise<TranslationRepository> {
    const result = {} as TranslationRepository;
    result.url = url;
    await load_repository0(result, false);
    return result;
}

export namespace config {
    export interface TranslationConfig {
        current_repository_url?: string;
        current_language?: string;

        current_translation_url?: string;
        current_translation_path?: string;
    }

    export interface RepositoryConfig {
        repositories?: {
            url?: string;
            repository?: TranslationRepository;
        }[];
    }

    const repository_config_key = "i18n.repository";
    let _cached_repository_config: RepositoryConfig;
    export function repository_config() {
        if(_cached_repository_config)
            return _cached_repository_config;

        const config_string = localStorage.getItem(repository_config_key);
        let config: RepositoryConfig;
        try {
            config = config_string ? JSON.parse(config_string) : {};
        } catch(error) {
            logError(LogCategory.I18N, tr("Failed to parse repository config: %o"), error);
        }
        config.repositories = config.repositories || [];
        for(const repo of config.repositories)
            (repo.repository || {load_timestamp: 0}).load_timestamp = 0;

        if(config.repositories.length == 0) {
            //Add the default TeaSpeak repository
            load_repository(StaticSettings.instance.static(Settings.KEY_I18N_DEFAULT_REPOSITORY)).then(repo => {
                logInfo(LogCategory.I18N, tr("Successfully added default repository from \"%s\"."), repo.url);
                register_repository(repo);
            }).catch(error => {
                logWarn(LogCategory.I18N, tr("Failed to add default repository. Error: %o"), error);
            });
        }

        return _cached_repository_config = config;
    }

    export function save_repository_config() {
        localStorage.setItem(repository_config_key, JSON.stringify(_cached_repository_config));
    }

    const translation_config_key = "i18n.translation";
    let _cached_translation_config: TranslationConfig;

    export function translation_config() : TranslationConfig {
        if(_cached_translation_config)
            return _cached_translation_config;

        const config_string = localStorage.getItem(translation_config_key);
        try {
            _cached_translation_config = config_string ? JSON.parse(config_string) : {};
        } catch(error) {
            logError(LogCategory.I18N, tr("Failed to initialize translation config. Using default one. Error: %o"), error);
            _cached_translation_config = {} as any;
        }
        return _cached_translation_config;
    }

    export function save_translation_config() {
        localStorage.setItem(translation_config_key, JSON.stringify(_cached_translation_config));
    }
}

export function register_repository(repository: TranslationRepository) {
    if(!repository) return;

    for(const repo of config.repository_config().repositories)
        if(repo.url == repository.url) return;

    config.repository_config().repositories.push(repository);
    config.save_repository_config();
}

export function registered_repositories() : TranslationRepository[] {
    return config.repository_config().repositories.map(e => e.repository || {url: e.url, load_timestamp: 0} as TranslationRepository);
}

export function delete_repository(repository: TranslationRepository) {
    if(!repository) return;

    for(const repo of [...config.repository_config().repositories])
        if(repo.url == repository.url) {
            config.repository_config().repositories.remove(repo);
        }
    config.save_repository_config();
}

export async function iterate_repositories(callback_entry: (repository: TranslationRepository) => any) {
    const promises = [];

    for(const repository of registered_repositories()) {
        promises.push(load_repository0(repository, false).then(() => callback_entry(repository)).catch(error => {
            logWarn(LogCategory.I18N, "Failed to fetch repository %s. error: %o", repository.url, error);
        }));
    }

    await Promise.all(promises);
}

export function select_translation(repository: TranslationRepository, entry: RepositoryTranslation) {
    const cfg = config.translation_config();

    if(entry && repository) {
        cfg.current_language = entry.name;
        cfg.current_repository_url = repository.url;
        cfg.current_translation_url = repository.url + entry.path;
        cfg.current_translation_path = entry.path;
    } else {
        cfg.current_language = undefined;
        cfg.current_repository_url = undefined;
        cfg.current_translation_url = undefined;
        cfg.current_translation_path = undefined;
    }

    config.save_translation_config();
}

/* ATTENTION: This method is called before most other library initialisations! */
export async function initialize() {
    const rcfg = config.repository_config(); /* initialize */
    const cfg = config.translation_config();

    if(cfg.current_translation_url) {
        try {
            await load_file(cfg.current_translation_url, cfg.current_translation_path);
            translateCache = {};
        } catch (error) {
            logError(LogCategory.I18N, tr("Failed to initialize selected translation: %o"), error);
            const show_error = () => {
                import("../ui/elements/Modal").then(Modal => {
                    Modal.createErrorModal(tr("Translation System"), tra("Failed to load current selected translation file.{:br:}File: {0}{:br:}Error: {1}{:br:}{:br:}Using default fallback translations.", cfg.current_translation_url, error)).open()
                });
            };
            if(loader.running())
                loader.register_task(loader.Stage.JAVASCRIPT_INITIALIZING, {
                    priority: 10,
                    function: async () => show_error(),
                    name: "I18N error display"
                });
            else
                show_error();
        }
    }
    // await load_file("http://localhost/home/TeaSpeak/TeaSpeak/Web-Client/web/environment/development/i18n/de_DE.translation");
    // await load_file("http://localhost/home/TeaSpeak/TeaSpeak/Web-Client/web/environment/development/i18n/test.json");
}

declare global {
    interface Window {
        tr(message: string) : string;
        tra(message: string, ...args: (string | number | boolean | null | undefined)[]) : string;
        tra(message: string, ...args: any[]) : JQuery[];

        log: any;
        StaticSettings: any;
    }

    const tr: typeof window.tr;
    const tra: typeof window.tra;
}

window.tr = tr;
window.tra = tra;