import {WhisperSession, WhisperSessionEvents, WhisperSessionState} from "tc-shared/voice/VoiceWhisper";
import {Registry} from "tc-shared/events";
import {VoicePlayer, VoicePlayerState} from "tc-shared/voice/VoicePlayer";
import {WhisperSessionInitializeData} from "tc-shared/connection/VoiceConnection";
import {VoiceWhisperPacket} from "./bridge/VoiceBridge";
import {WebVoicePlayer} from "./VoicePlayer";

const kMaxUninitializedBuffers = 10;
export class WebWhisperSession implements WhisperSession {
    readonly events: Registry<WhisperSessionEvents>;
    private readonly clientId: number;

    private clientName: string;
    private clientUniqueId: string;

    private sessionState: WhisperSessionState;
    private sessionBlocked: boolean;

    private sessionTimeout: number;
    private sessionTimeoutId: number;

    private lastWhisperTimestamp: number;
    private packetBuffer: VoiceWhisperPacket[] = [];

    private voicePlayer: WebVoicePlayer;

    constructor(initialPacket: VoiceWhisperPacket) {
        this.events = new Registry<WhisperSessionEvents>();
        this.clientId = initialPacket.clientId;
        this.clientName = initialPacket.clientNickname;
        this.clientUniqueId = initialPacket.clientUniqueId;
        this.sessionState = WhisperSessionState.INITIALIZING;
    }

    getClientId(): number {
        return this.clientId;
    }

    getClientName(): string | undefined {
        return this.clientName;
    }

    getClientUniqueId(): string | undefined {
        return this.clientUniqueId;
    }

    getLastWhisperTimestamp(): number {
        return this.lastWhisperTimestamp;
    }

    getSessionState(): WhisperSessionState {
        return this.sessionState;
    }

    getSessionTimeout(): number {
        return this.sessionTimeout;
    }

    getVoicePlayer(): VoicePlayer | undefined {
        return this.voicePlayer;
    }

    setSessionTimeout(timeout: number) {
        this.sessionTimeout = timeout;
        this.resetSessionTimeout();
    }

    isBlocked(): boolean {
        return this.sessionBlocked;
    }

    setBlocked(blocked: boolean) {
        this.sessionBlocked = blocked;
    }

    async initializeFromData(data: WhisperSessionInitializeData) {
        this.clientName = data.clientName;
        this.clientUniqueId = data.clientUniqueId;

        this.sessionBlocked = data.blocked;
        this.sessionTimeout = data.sessionTimeout;

        this.voicePlayer = new WebVoicePlayer();
        this.voicePlayer.setVolume(data.volume);
        this.voicePlayer.events.on("notify_state_changed", event => {
            if(event.newState === VoicePlayerState.BUFFERING) {
                return;
            }

            this.resetSessionTimeout();
            if(event.newState === VoicePlayerState.PLAYING || event.newState === VoicePlayerState.STOPPING) {
                this.setSessionState(WhisperSessionState.PLAYING);
            } else {
                this.setSessionState(WhisperSessionState.PAUSED);
            }
        });
        this.setSessionState(WhisperSessionState.PAUSED);
    }

    initializeFailed() {
        this.setSessionState(WhisperSessionState.INITIALIZE_FAILED);

        /* if we're receiving nothing for more than 5 seconds we can try it again */
        this.sessionTimeout = 5000;
        this.resetSessionTimeout();
    }

    destroy() {
        clearTimeout(this.sessionTimeoutId);
        this.events.destroy();
        this.voicePlayer?.destroy();
        this.voicePlayer = undefined;
    }

    enqueueWhisperPacket(packet: VoiceWhisperPacket) {
        this.resetSessionTimeout();
        if(this.sessionBlocked) {
            /* do nothing, the session has been blocked */
            return;
        }

        if(this.sessionState === WhisperSessionState.INITIALIZE_FAILED) {
            return;
        } else if(this.sessionState === WhisperSessionState.INITIALIZING) {
            this.packetBuffer.push(packet);

            while(this.packetBuffer.length > kMaxUninitializedBuffers) {
                this.packetBuffer.pop_front();
            }
        } else {
            this.voicePlayer?.enqueueAudioPacket(packet.voiceId, packet.codec, packet.head, packet.payload);
        }
    }

    setSessionState(state: WhisperSessionState) {
        if(this.sessionState === state) {
            return;
        }

        const oldState = this.sessionState;
        this.sessionState = state;
        this.events.fire("notify_state_changed", { oldState: oldState, newState: state });
    }

    private resetSessionTimeout() {
        clearTimeout(this.sessionTimeoutId);
        if(this.sessionState === WhisperSessionState.PLAYING) {
            /* no need to reschedule a session timeout if we're currently playing */
            return;
        } else if(this.sessionState === WhisperSessionState.INITIALIZING) {
            /* we're still initializing; a session timeout hasn't been set */
            return;
        }

        this.sessionTimeoutId = setTimeout(() => {
            this.events.fire("notify_timed_out");
        }, Math.max(this.sessionTimeout, 1000));
    }
}