import {VideoSource} from "tc-shared/video/VideoSource";
import {Registry} from "tc-shared/events";
import {ConnectionStatus} from "tc-shared/ui/frames/footer/StatusDefinitions";
import {ConnectionStatistics} from "tc-shared/connection/ConnectionBase";

export type VideoBroadcastType = "camera" | "screen";

export type VideoBroadcastStatistics = {
    dimensions: { width: number, height: number },
    frameRate: number,

    codec: { name: string, payloadType: number }

    maxBandwidth: number,
    bandwidth: number,

    qualityLimitation: "cpu" | "bandwidth",

    source: {
        frameRate: number,
        dimensions: { width: number, height: number },
    }
};

export interface VideoConnectionEvent {
    notify_status_changed: { oldState: VideoConnectionStatus, newState: VideoConnectionStatus },
    notify_local_broadcast_state_changed: { broadcastType: VideoBroadcastType, oldState: VideoBroadcastState, newState: VideoBroadcastState },
}

export enum VideoConnectionStatus {
    /** We're currently not connected to the target server */
    Disconnected,
    /** We're trying to connect to the target server */
    Connecting,
    /** We're connected */
    Connected,
    /** The connection has failed for the current server connection */
    Failed,
    /** Video connection is not supported (the server dosn't support it) */
    Unsupported
}

export enum VideoBroadcastState {
    Stopped,
    Available, /* A stream is available but we've not joined it */
    Initializing,
    Running,
    /* We've a stream but the stream does not replays anything */
    Buffering,
}

export interface VideoClientEvents {
    notify_broadcast_state_changed: { broadcastType: VideoBroadcastType, oldState: VideoBroadcastState, newState: VideoBroadcastState }
}

export interface VideoClient {
    getClientId() : number;
    getEvents() : Registry<VideoClientEvents>;

    getVideoState(broadcastType: VideoBroadcastType) : VideoBroadcastState;
    getVideoStream(broadcastType: VideoBroadcastType) : MediaStream;

    joinBroadcast(broadcastType: VideoBroadcastType) : Promise<void>;
    leaveBroadcast(broadcastType: VideoBroadcastType);
}

export interface VideoConnection {
    getEvents() : Registry<VideoConnectionEvent>;

    getStatus() : VideoConnectionStatus;
    getRetryTimestamp() : number | 0;
    getFailedMessage() : string;

    getConnectionStats() : Promise<ConnectionStatistics>;

    isBroadcasting(type: VideoBroadcastType);
    getBroadcastingSource(type: VideoBroadcastType) : VideoSource | undefined;
    getBroadcastingState(type: VideoBroadcastType) : VideoBroadcastState;
    getBroadcastStatistics(type: VideoBroadcastType) : Promise<VideoBroadcastStatistics | undefined>;

    /**
     * @param type
     * @param source The source of the broadcast (No ownership will be taken. The voice connection must ref the source by itself!)
     */
    startBroadcasting(type: VideoBroadcastType, source: VideoSource) : Promise<void>;
    stopBroadcasting(type: VideoBroadcastType);

    registerVideoClient(clientId: number);
    registeredVideoClients() : VideoClient[];
    unregisterVideoClient(client: VideoClient);
}