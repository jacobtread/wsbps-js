import { PacketDefinition } from "./packets";
import { DataViewTracker, StructLayout, StructTyped, VarInt } from "./data";

export interface Config {
    reconnectTimeout?: number;
}

type EventFunction = (event: Event) => any
type PacketListener<T extends StructLayout, K extends StructTyped<T>> = (packet: K) => any;
type PacketListeners = { [key: number]: PacketListener<any, any>[] }
type PacketInterceptor = (id: number, data: StructTyped<any>) => any
type EventNames = 'open' | 'close'

type EventListeners = Record<EventNames, EventFunction[] | undefined>;

/**
 * A wrapper around the websocket class to provide functionality
 * for encoding and decoding binary packets for GoWSPS
 */
export class BinarySocket {
    // The websocket connection
    ws: WebSocket;
    // The configuration settings
    config: Config;

    // The url that should be connected to
    private readonly url: string | URL;

    // Open and close event listeners
    private eventListeners: EventListeners = {
        open: undefined,
        close: undefined
    }
    private packetInterceptor?: PacketInterceptor;

    // Listeners for each packet types
    private packetListeners: PacketListeners = {};

    // The definitions mapped to the id of the packet
    private definitions: Record<number, PacketDefinition<any>> = {}

    // Tracker for tracking write offset position
    private writeTracker: DataViewTracker = new DataViewTracker()
    // Tracker for tracking read offset position
    private readTracker: DataViewTracker = new DataViewTracker()

    /**
     * Creates a new instance of the binary socket
     *
     * @param url
     * @param config
     */
    constructor(url: string | URL, config?: Config) {
        this.url = url;
        this.config = config ?? {};
        this.ws = this.createConnection()
    }

    /**
     * Creates a new connection to the websocket and adds
     * all the listeners
     *
     * @private Shouldn't be accessed outside this class
     */
    private createConnection(): WebSocket {
        const ws = new WebSocket(this.url)
        ws.binaryType = 'arraybuffer';
        ws.onopen = (event: Event) => {
            if (ws.readyState === WebSocket.OPEN) {
                this.event('open', event)
            }
        }
        ws.onclose = (event: Event) => {
            this.event('close', event)
            console.log('Connection closed', event)
            if (this.config.reconnectTimeout !== undefined) {
                setTimeout(() => {
                    this.ws = this.createConnection();
                    console.debug('Reconnecting socket')
                }, this.config.reconnectTimeout)
            }
        }
        ws.onmessage = (event: MessageEvent) => {
            const view: DataView = new DataView(event.data as ArrayBuffer)
            const id: number = VarInt.decode(view, this.readTracker)
            const definition: PacketDefinition<any> | undefined = this.definitions[id]
            if (definition) {
                const out = definition.decode(view, this.readTracker)
                const listeners = this.packetListeners[id]
                if (listeners) {
                    for (let listener of listeners) {
                        listener(out)
                    }
                }
            } else {
                console.error(`No packet definition defined for ${id.toString(16)}`)
            }
            this.readTracker.reset()
        }
        return ws
    }

    send<T extends StructLayout>(definition: PacketDefinition<T>, data: StructTyped<T>) {
        const buffer = definition.create(this.writeTracker, data)
        this.ws.send(buffer)
    }

    createBuffer<T extends StructLayout>(definition: PacketDefinition<T>, data: StructTyped<T>): ArrayBuffer {
        return definition.create(this.writeTracker, data)
    }

    sendBuffer(data: ArrayBuffer) {
        this.ws.send(data)
    }

    definePacket(packet: PacketDefinition<any>) {
        this.definitions[packet.id] = packet
    }

    definePackets(...packets: PacketDefinition<any>[]) {
        for (let packet of packets) {
            this.definitions[packet.id] = packet
        }
    }

    addListener<T extends StructLayout>(definition: PacketDefinition<T>, handler: PacketListener<T, StructTyped<T>>) {
        const listeners = this.packetListeners[definition.id]
        if (listeners) {
            listeners.push(handler)
        } else {
            this.packetListeners[definition.id] = [handler]
        }
    }

    removeListener<T extends StructLayout>(definition: PacketDefinition<T>, handler?: PacketListener<T, StructTyped<T>>) {
        const id = definition.id;
        const listeners = this.packetListeners[id]
        if (listeners) {
            if (handler) {
                this.packetListeners[id] = listeners.filter(v => v !== handler)
            } else {
                this.packetListeners[id] = []
            }
        }
    }

    private event(name: EventNames, data: Event) {
        const listeners = this.eventListeners[name];
        if (listeners) {
            for (let listener of listeners) {
                listener(data)
            }
        }
    }

    addEventListener(event: EventNames, listener: EventFunction) {
        const listeners = this.eventListeners[event]
        if (listeners) {
            listeners.push(listener)
        } else {
            this.eventListeners[event] = [listener]
        }
    }

    removeEventListener(event: EventNames, listener?: EventFunction) {
        const listeners = this.eventListeners[event]
        if (listeners) {
            if (listener) {
                this.eventListeners[event] = listeners.filter(v => v !== listener)
            } else {
                this.eventListeners[event] = undefined
            }
        }
    }

    setInterceptor(interceptor: PacketInterceptor) {
        this.packetInterceptor = interceptor
    }
}
