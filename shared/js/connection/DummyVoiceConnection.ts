import {
    AbstractVoiceConnection,
    VoiceConnectionStatus, WhisperSessionInitializer
} from "../connection/VoiceConnection";
import {RecorderProfile} from "../voice/RecorderProfile";
import {AbstractServerConnection, ConnectionStatistics} from "../connection/ConnectionBase";
import {VoiceClient} from "../voice/VoiceClient";
import {VoicePlayerEvents, VoicePlayerLatencySettings, VoicePlayerState} from "../voice/VoicePlayer";
import {WhisperSession, WhisperTarget} from "../voice/VoiceWhisper";
import {Registry} from "../events";
import { tr } from "tc-shared/i18n/localize";

class DummyVoiceClient implements VoiceClient {
    readonly events: Registry<VoicePlayerEvents>;
    private readonly clientId: number;
    private volume: number;

    constructor(clientId: number) {
        this.events = new Registry<VoicePlayerEvents>();
        this.clientId = clientId;
        this.volume = 1;
    }

    getClientId(): number {
        return this.clientId;
    }

    getVolume(): number {
        return this.volume;
    }

    setVolume(volume: number) {
        this.volume = volume;
    }

    getState(): VoicePlayerState {
        return VoicePlayerState.STOPPED;
    }

    getLatencySettings(): Readonly<VoicePlayerLatencySettings> {
        return { maxBufferTime: 0, minBufferTime: 0 };
    }

    setLatencySettings(settings) { }

    flushBuffer() { }
    abortReplay() { }


    resetLatencySettings() {
    }
}

export class DummyVoiceConnection extends AbstractVoiceConnection {
    private recorder: RecorderProfile;
    private voiceClients: DummyVoiceClient[] = [];

    constructor(connection: AbstractServerConnection) {
        super(connection);
    }

    async acquireVoiceRecorder(recorder: RecorderProfile | undefined): Promise<void> {
        if(this.recorder === recorder) {
            return;
        }

        if(this.recorder) {
            this.recorder.callback_unmount = undefined;
            await this.recorder.unmount();
        }

        await recorder?.unmount();
        const oldRecorder = this.recorder;
        this.recorder = recorder;

        if(this.recorder) {
            this.recorder.callback_unmount = () => {
                this.recorder = undefined;
                this.events.fire("notify_recorder_changed");
            }
        }

        this.events.fire("notify_recorder_changed", {
            oldRecorder,
            newRecorder: recorder
        });
    }

    availableVoiceClients(): VoiceClient[] {
        return this.voiceClients;
    }

    decodingSupported(codec: number): boolean {
        return false;
    }

    encodingSupported(codec: number): boolean {
        return false;
    }

    getConnectionState(): VoiceConnectionStatus {
        return VoiceConnectionStatus.ClientUnsupported;
    }

    getEncoderCodec(): number {
        return 0;
    }

    registerVoiceClient(clientId: number): VoiceClient {
        const client = new DummyVoiceClient(clientId);
        this.voiceClients.push(client);
        return client;
    }

    setEncoderCodec(codec: number) {}

    async unregisterVoiceClient(client: VoiceClient): Promise<void> {
        this.voiceClients.remove(client as any);
    }

    voiceRecorder(): RecorderProfile {
        return this.recorder;
    }

    dropWhisperSession(session: WhisperSession) { }

    getWhisperSessionInitializer(): WhisperSessionInitializer | undefined {
        return undefined;
    }

    getWhisperSessions(): WhisperSession[] {
        return [];
    }

    setWhisperSessionInitializer(initializer: WhisperSessionInitializer | undefined) { }

    getWhisperTarget(): WhisperTarget | undefined {
        return undefined;
    }

    startWhisper(target: WhisperTarget): Promise<void> {
        return Promise.reject(tr("not supported"));
    }

    stopWhisper() { }

    getFailedMessage(): string {
        return "";
    }

    isReplayingVoice(): boolean {
        return false;
    }

    stopAllVoiceReplays() { }

    async getConnectionStats(): Promise<ConnectionStatistics> {
        return {
            bytesReceived: 0,
            bytesSend: 0
        }
    }

    getRetryTimestamp(): number | 0 {
        return 0;
    }
}