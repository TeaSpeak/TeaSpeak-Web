import {CommandResult} from "tc-shared/connection/ServerConnectionDeclaration";
import {IdentitifyType} from "tc-shared/profiles/Identity";
import {TeaSpeakIdentity} from "tc-shared/profiles/identities/TeamSpeakIdentity";
import {AbstractServerConnection} from "tc-shared/connection/ConnectionBase";
import {ConnectionProfile} from "tc-shared/profiles/ConnectionProfile";
import {settings} from "tc-shared/settings";
import {ConnectParameters, DisconnectReason} from "tc-shared/ConnectionHandler";
import {tr} from "tc-shared/i18n/localize";

export interface HandshakeIdentityHandler {
    connection: AbstractServerConnection;

    start_handshake();
    register_callback(callback: (success: boolean, message?: string) => any);
}

export class HandshakeHandler {
    private connection: AbstractServerConnection;
    private handshake_handler: HandshakeIdentityHandler;
    private failed = false;

    readonly profile: ConnectionProfile;
    readonly parameters: ConnectParameters;

    constructor(profile: ConnectionProfile, parameters: ConnectParameters) {
        this.profile = profile;
        this.parameters = parameters;
    }

    setConnection(con: AbstractServerConnection) {
        this.connection = con;
    }

    initialize() {
        this.handshake_handler = this.profile.spawn_identity_handshake_handler(this.connection);
        if(!this.handshake_handler) {
            this.handshake_failed("failed to create identity handler");
            return;
        }

        this.handshake_handler.register_callback((flag, message) => {
            if(flag)
                this.handshake_finished();
            else
                this.handshake_failed(message);
        });
    }

    get_identity_handler() : HandshakeIdentityHandler {
        return this.handshake_handler;
    }

    startHandshake() {
        this.handshake_handler.start_handshake();
    }

    on_teamspeak() {
        const type = this.profile.selected_type();
        if(type == IdentitifyType.TEAMSPEAK)
            this.handshake_finished();
        else {

            if(this.failed) return;

            this.failed = true;
            this.connection.client.handleDisconnect(DisconnectReason.HANDSHAKE_TEAMSPEAK_REQUIRED);
        }
    }

    private handshake_failed(message: string) {
        if(this.failed) return;

        this.failed = true;
        this.connection.client.handleDisconnect(DisconnectReason.HANDSHAKE_FAILED, message);
    }

    private handshake_finished(version?: string) {
        const _native = window["native"];
        if(__build.target === "client" && _native.client_version && !version) {
            _native.client_version()
                .then( this.handshake_finished.bind(this))
                .catch(error => {
                    console.error(tr("Failed to get version: %o"), error);
                    this.handshake_finished("?.?.?");
                });
            return;
        }

        const browser_name = (navigator.browserSpecs || {})["name"] || " ";
        let data = {
            client_nickname: this.parameters.nickname || "Another TeaSpeak user",
            client_platform: (browser_name ? browser_name + " " : "") + navigator.platform,
            client_version: "TeaWeb " + __build.version + " (" + navigator.userAgent + ")",
            client_version_sign: undefined,

            client_default_channel: (this.parameters.channel || {} as any).target,
            client_default_channel_password: (this.parameters.channel || {} as any).password,
            client_default_token: this.parameters.token,

            client_server_password: this.parameters.password ? this.parameters.password.password : undefined,
            client_browser_engine: navigator.product,

            client_input_hardware: this.connection.client.hasInputHardware(),
            client_output_hardware: false,
            client_input_muted: this.connection.client.isMicrophoneMuted(),
            client_output_muted: this.connection.client.isSpeakerMuted(),
        };

        if(version) {
            data.client_version = "TeaClient " + version;

            const os = __non_webpack_require__("os");
            const arch_mapping = {
                "x32": "32bit",
                "x64": "64bit"
            };

            data.client_version += " " + (arch_mapping[os.arch()] || os.arch());

            const os_mapping = {
                "win32": "Windows",
                "linux": "Linux"
            };
            data.client_platform = (os_mapping[os.platform()] || os.platform());
        }

        if(this.profile.selected_type() === IdentitifyType.TEAMSPEAK)
            data["client_key_offset"] = (this.profile.selected_identity() as TeaSpeakIdentity).hash_number;

        this.connection.send_command("clientinit", data).catch(error => {
            if(error instanceof CommandResult) {
                if(error.id == 1028) {
                    this.connection.client.handleDisconnect(DisconnectReason.SERVER_REQUIRES_PASSWORD);
                } else if(error.id == 783 || error.id == 519) {
                    error.extra_message = isNaN(parseInt(error.extra_message)) ? "8" : error.extra_message;
                    this.connection.client.handleDisconnect(DisconnectReason.IDENTITY_TOO_LOW, error);
                } else if(error.id == 3329) {
                    this.connection.client.handleDisconnect(DisconnectReason.HANDSHAKE_BANNED, error);
                } else {
                    this.connection.client.handleDisconnect(DisconnectReason.CLIENT_KICKED, error);
                }
            } else
                this.connection.disconnect();
        });
    }
}