import { DataType, DataViewTracker, StructLayout, StructTyped, VarInt, VarIntSize } from "./data";


// Represents a key of a struct
export type StructKey<T> = keyof T;
// Represents all the keys of a struct
export type StructKeys<T> = Array<StructKey<T>>;

// Represents the pairing of a key and data type
type DefinitionField<T> = [StructKey<T>, DataType<any>];
// Represents all the pairs of keys and data types for a struct
type DefinitionFields<T> = DefinitionField<T>[];

export class StructDefinition<T extends StructLayout> {
    private readonly fields: DefinitionFields<T>;

    constructor(struct: T, keys: StructKeys<T>) {
        const fields: DefinitionFields<T> = new Array(keys.length);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i], type = struct[key];
            fields[i] = [key, type];
        }
        this.fields = fields;
    }

    computeSize(packet: StructTyped<T>) {
        let size: number = 0;
        for (let [key, type] of this.fields) {
            const s = type.size
            if (typeof s === 'number') {
                size += s
            } else {
                size += s(packet[key])
            }
        }
        return size
    }

    decode(view: DataView, tracker: DataViewTracker): StructTyped<T> {
        const out: any = {};
        for (let [key, type] of this.fields) {
            out[key] = type.decode(view, tracker);
        }
        return out;
    }

    encode(view: DataView, tracker: DataViewTracker, struct: StructTyped<T>) {
        for (let [key, type] of this.fields) {
            const value = struct[key]
            type.encode(view, tracker, value)
        }
    }
}

export class PacketDefinition<T extends StructLayout> extends StructDefinition<T> {

    // The id of this packet
    public readonly id: number;

    /**
     * Creates a new packet definition from the provided data
     *
     * @param id The id of the packet
     * @param struct The structure of the packet
     * @param keys The order of the packet keys
     */
    constructor(id: number, struct: T, keys: StructKeys<T>) {
        super(struct, keys)
        this.id = id;
    }

    /**
     * Function for encoding the packet into an array buffer.
     * this will reset write tracker after writing into the
     * buffer.
     *
     * Encoding:
     * ID     VarInt
     * Data   StructTyped<T>
     *
     *
     * @param writeTracker The write tracker to keep track of write progress
     * @param data The packet data to write
     * @return An array buffer of the binary packet data
     */
    create(writeTracker: DataViewTracker, data: StructTyped<T>): ArrayBuffer {
        const buffer = new ArrayBuffer(VarIntSize(this.id) + this.computeSize(data));
        const view = new DataView(buffer);
        VarInt.encode(view, writeTracker, this.id)
        super.encode(view, writeTracker, data)
        writeTracker.reset()
        return buffer
    }
}
