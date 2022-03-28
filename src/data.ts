import { StructDefinition, StructKeys } from "./packets";

// A function for determining the size of the N object
export type DataSizeFunction<N> = (value: N) => number;
// Either the size as a number or a function which takes the value and returns its size
export type DataSize<N> = number | DataSizeFunction<N>;

/**
 * A simple class for tracking the offset progress. Used to keep track
 * of the view offset for the DataView
 */
export class DataViewTracker {
    // The current offset value
    private offset: number = 0;

    /**
     * Move the offset by more than once place
     *
     * @param amount The amount of places to move by
     * @return The offset before this change
     */
    many(amount: number): number {
        const original = this.offset;
        this.offset += amount
        return original
    }

    /**
     * Move the offset by a single place
     *
     * @return The offset before this change
     */
    one(): number {
        return this.offset++
    }

    /**
     * Resets the offset to its initial value
     */
    reset() {
        this.offset = 0;
    }
}

/**
 * The structure for a custom data type. Includes functions
 * for encoding, decoding and finding the size of values
 * using this data type.
 *
 * @type N The JavaScript type for this DataType
 */
export interface DataType<N> {
    /**
     * A function for calculating the size of this data
     * or the fixed size of this data as a number
     */
    size: DataSize<N>,

    /**
     * This function encodes the provided value using
     * the custom encoding for this data type
     *
     * @param d The data view to encode to
     * @param t The offset tracker instance
     * @param v The value to encode
     */
    encode(d: DataView, t: DataViewTracker, v: N): void;

    /**
     * This function decodes the binary data for this type
     * and returns the javascript type
     *
     * @param d The data view to encode to
     * @param t The offset tracker instance
     */
    decode(d: DataView, t: DataViewTracker): N;
}

// 8-bit signed integer (-128 to 127)
export const Int8: DataType<number> = {
    size: 1,
    encode: (d, t, v) => d.setInt8(t.one(), v),
    decode: (d, t) => d.getInt8(t.one())
}

// 16-bit signed integer (-32768 to 32767)
export const Int16: DataType<number> = {
    size: 2,
    encode: (d, t, v) => d.setInt16(t.many(2), v),
    decode: (d, t) => d.getInt16(t.many(2))
}

// 32-bit signed integer (-2147483648 to 2147483647)
export const Int32: DataType<number> = {
    size: 4,
    encode: (d, t, v) => d.setInt32(t.many(4), v),
    decode: (d, t) => d.getInt32(t.many(4))
}

// 8-bit un-signed integer (0 to 255)
export const UInt8: DataType<number> = {
    size: 1,
    encode: (d, t, v) => d.setUint8(t.one(), v),
    decode: (d, t) => d.getUint8(t.one())
}

// 16-bit un-signed integer (0 to 65535)
export const UInt16: DataType<number> = {
    size: 2,
    encode: (d, t, v) => d.setUint16(t.many(2), v),
    decode: (d, t) => d.getUint16(t.many(2))
}

// 32-bit un-signed integer (0 to 4294967295)
export const UInt32: DataType<number> = {
    size: 4,
    encode: (d, t, v) => d.setUint32(t.many(4), v),
    decode: (d, t) => d.getUint32(t.many(4))
}

// 32-bit floating point (-3.4e+38 to 3.4e+38)
export const Float32: DataType<number> = {
    size: 4,
    encode: (d, t, v) => d.setFloat64(t.many(4), v),
    decode: (d, t) => d.getFloat32(t.many(4))
}

// 64-bit floating point (-1.7e+308 to +1.7e+308)
export const Float64: DataType<number> = {
    size: 8,
    encode: (d, t, v) => d.setFloat64(t.many(8), v),
    decode: (d, t) => d.getFloat64(t.many(8))
}

// Boolean stored as 8-bit integer
export const Bool: DataType<boolean> = {
    size: 1,
    encode: (d, t, v) => UInt8.encode(d, t, v ? 1 : 0),
    decode: (d, t): boolean => UInt8.decode(d, t) == 1
}

// Compressed int64 (0 to 18446744073709551615)
export const VarInt: DataType<number> = {
    size(value: number): number {
        let size = 0;
        while (value >= 0x80) {
            value >>= 7
            size++
        }
        return size + 1
    },
    encode(d: DataView, t: DataViewTracker, v: number) {
        while (v >= 0x80) {
            UInt8.encode(d, t, v | 0x80)
            v >>= 7
        }
        UInt8.encode(d, t, v);
    },
    decode(d: DataView, t: DataViewTracker): number {
        let value = 0, bitOffset = 0, byte = 0;
        for (let i = 0; i < 10; i++) {
            byte = UInt8.decode(d, t)
            if (byte < 0x80) {
                if (i == 9 && byte > 1) {
                    return value
                }
                return value | byte << bitOffset
            }
            value |= (byte & 0x7f) << bitOffset
            bitOffset += 7
        }
        return value
    }
}

/**
 * Calculates the size of the provided values based on
 * the provided type value. If the size is fixed then
 * its just multiplied by the value count. If the value
 * is a function its run on each of the values in the array
 *
 * @param values The values to calculate the size for
 * @param type The type of data (contains the size value)
 */
function getSizeOf<T, D extends DataType<T>>(values: T[], type: D): number {
    const s = type.size
    if (typeof s === 'number') {
        return s * values.length
    } else {
        let size = 0;
        for (let value of values) {
            size += s(value)
        }
        return size
    }
}

// The function for determining the size of a VarInt (used a lot so stored here)
export const VarIntSize: DataSizeFunction<number> = VarInt.size as DataSizeFunction<number>

// Array of bytes []byte
export const ByteArray: DataType<Uint8Array> = {
    size(value: Uint8Array): number {
        return VarIntSize(value.length) + value.length
    },
    encode(d: DataView, t: DataViewTracker, v: Uint8Array) {
        VarInt.encode(d, t, v.length)
        for (let elm of v) {
            UInt8.encode(d, t, elm)
        }
    },
    decode(d: DataView, t: DataViewTracker): Uint8Array {
        const size = VarInt.decode(d, t)
        return new Uint8Array(d.buffer, t.many(size), size)
    }
}

// String
export const Str: DataType<string> = {
    size(value: string): number {
        return VarIntSize(value.length) + value.length
    },
    encode(d: DataView, t: DataViewTracker, v: string) {
        VarInt.encode(d, t, v.length)
        for (let i = 0; i < v.length; i++) {
            UInt8.encode(d, t, v.charCodeAt(i))
        }
    },
    decode(d: DataView, t: DataViewTracker): string {
        const arr = ByteArray.decode(d, t)
        // @ts-ignore
        return String.fromCharCode.apply(null, arr);
    }
}

// Struct layouts are object mappings of keys to data types
export type StructLayout = Record<string, DataType<any>>;

// Struct typed are object mappings of keys with the js types of data types
export type StructTyped<Origin extends StructLayout> = {
    [Key in keyof Origin]: Origin[Key] extends DataType<infer V> ? V : unknown
}

// Map keys are only allowed to be numbers or strings
export type MapKey = number | string

/**
 * Encodes the provided data map struct (object with keys and values) as the
 * length of pairs and each key value pair encoded in their respective data types.
 *
 * Only Str or Int types can be used as keys for this struct
 *
 * This type should be used when the keys are dynamically generated otherwise
 * the {@see Struct} should be used instead
 *
 * Encoding:
 *
 * Length    VarInt
 * for Length {
 *     Key    DataType<A>
 *     Value  DataType<B>
 * }
 *
 *
 * @param keyType The data type of the key's (restricted to string and numbers)
 * @param valueType The data type of the value's
 * @constructor Creates a new data type for the provided key value pairs
 */
export function MapType<A extends MapKey, B>(keyType: DataType<A>, valueType: DataType<B>): DataType<Record<A, B>> {
    return {
        size(value: Record<A, B>): number {
            const keys = Object.keys(value);
            return VarIntSize(keys.length)
                + getSizeOf(keys as A[], keyType)
                + getSizeOf(Object.values<B>(value), valueType);
        },
        encode(d: DataView, t: DataViewTracker, v: Record<A, B>): void {
            const keys = Object.keys(v) as A[];
            VarInt.encode(d, t, keys.length);
            for (let key of keys) {
                const value = v[key];
                keyType.encode(d, t, key);
                valueType.encode(d, t, value);
            }
        },
        decode(d: DataView, t: DataViewTracker): Record<A, B> {
            const length = VarInt.decode(d, t)
            const out: any = {}
            for (let i = 0; i < length; i++) {
                const key = keyType.decode(d, t)
                out[key] = valueType.decode(d, t)
            }
            return out;
        },
    }
}

/**
 * Creates a DataType for encoding the provided struct of known key value pairs.
 * The struct will be encoded in the order provided as the keys argument
 *
 * Values are encoding according to the data type provided to each key in the
 * struct layout. Keys are known only by the encoder and decoder they are not
 * included in the encoded struct.
 *
 * @param struct The struct layout includes a key value pair of keys to DataTypes
 * @param keys The order of the keys to encode / decode
 * @constructor Creates a new struct definition DataType
 */
export function Struct<T extends StructLayout>(struct: T, keys: StructKeys<T>): DataType<StructTyped<T>> {
    const definition = new StructDefinition<T>(struct, keys)
    return {
        size(value: StructTyped<T>): number {
            return definition.computeSize(value)
        },
        encode(d: DataView, t: DataViewTracker, v: StructTyped<T>) {
            definition.encode(d, t, v)
        },
        decode(d: DataView, t: DataViewTracker): StructTyped<T> {
            return definition.decode(d, t)
        }
    }
}

/***
 * Creates a DataType for an array of structs. This is a shortcut to replace the {@see ArrayType}
 * function when the DataType is a struct. This skips the additional step of calling {@see Struct}
 * before calling {@see ArrayType}
 *
 * Encoding:
 *
 * Length VarInt
 * for Length {
 *    Struct DataType<StructTyped<T>>
 * }
 *
 * @param struct The struct layout includes a key value pair of keys to DataTypes
 * @param keys The order of the keys to encode / decode
 * @constructor Creates a new array struct definition DataType
 */
export function StructArray<T extends StructLayout>(struct: T, keys: StructKeys<T>): DataType<StructTyped<T>[]> {
    const definition = new StructDefinition<T>(struct, keys)
    return {
        size(value: StructTyped<T>[]): number {
            let size = 0;
            for (let elm of value) {
                size += definition.computeSize(elm)
            }
            return VarIntSize(value.length) + size
        },
        encode(d: DataView, t: DataViewTracker, v: StructTyped<T>[]) {
            VarInt.encode(d, t, v.length)
            for (let elm of v) {
                definition.encode(d, t, elm)
            }
        },
        decode(d: DataView, t: DataViewTracker): StructTyped<T>[] {
            const count = VarInt.decode(d, t)
            const out: StructTyped<T>[] = new Array(count)
            for (let i = 0; i < count; i++) {
                out[i] = definition.decode(d, t)
            }
            return out;
        }
    }
}

/**
 * Creates a DataType for encoding an array of a DataType if you are using an array of structs
 * that you are not using anywhere else you should use the {@see StructArray} function instead.
 *
 * Encoding:
 *
 * Length VarInt
 * for Length {
 *     Value DataType<T>
 * }
 *
 * @param type The type of data this array should encode
 * @constructor Creates a new DataType array DataType
 */
export function ArrayType<T>(type: DataType<T>): DataType<T[]> {
    return {
        size(value: T[]) {
            return getSizeOf(value, type) + VarIntSize(value.length)
        },
        encode(d: DataView, t: DataViewTracker, v: T[]): void {
            VarInt.encode(d, t, v.length)
            for (let value of v) {
                type.encode(d, t, value)
            }
        },
        decode(d: DataView, t: DataViewTracker): T[] {
            const count = VarInt.decode(d, t)
            const out: T[] = new Array(count)
            for (let i = 0; i < count; i++) {
                out[i] = type.decode(d, t)
            }
            return out
        }
    }
}
