# GoWSPS-js

The javascript client for the Go Websocket Packet System. I created this packet system in order to replace my default
mode of transmitting data between web sockets. via JSON which while small in code size creates unnecessarily large
packet sizes for even the smallest packets.

for example the following packet which takes up 40 bytes

```json
{
  "id": 2,
  "data": {
    "name": "test",
    "user": 2
  }
}
```

can be replaced with the following packet which only takes up 6 bytes

```shell
2 116 101 115 116 2
```

Which makes this a much more efficient way of transmitting data between client and server over websockets. This is
especially noticeable when the type of data that is needing to be sent is a byte array like images which would normally
have to be converted to base64 before sending them as JSON which greatly increases the size of the packet

## Create Socket

The following code is an example for creating a new `BinarySocket` which is a wrapper around the websocket object that
allows the handling of GoWSPS binary packets

```typescript
import { BinarySocket } from "gowsps-js";

const socket = new BinarySocket(SOCKET_URL)

```

Optionally you can supply a config with a reconnect timeout if you specify this timeout the socket will automatically
reconnect after being disconnected for the provided amount of time

```typescript
import { BinarySocket } from "gowsps-js";

const socket = new BinarySocket(SOCKET_URL, {
    reconnectTimeout: 1000 // The time in milliseconds
})
```

After creating a socket you must wait for the socket to become open before you can send any packets
the `addListener` function with a function as the first argument

```typescript
// ...
socket.addEventListener('open', () => {
    // TODO: Send some packets
})
```

> The available events are 'open' and 'close' if a reconnect timeout
> is specified in the config the 'close' event will be invoked before 
> reconnecting.

you can remove listeners using the `removeEventListener` function. Providing
it a function as the second argument will only remove that event listener function
but providing no second argument will remove all event listeners for that event.

```typescript
socket.removeEventListener('open')
// ..or
socket.removeEventListener('open', someFunction)
```

## Defining A Packet

The following code is used to define a packet. The first argument is the unique id of the packet. These are encoded as
VarInts. The second argument is object which maps the names of each field to the data type of that field. The names are
used in the third argument which defines the order in which the fields should be encoded / decoded

```typescript
// gowsps exports custom data types you must use these
// data types when defining your packet
import { UInt8, Str, PacketDefinition } from "gowsps-js";

// Create a new packet definition
const TestPacket = new PacketDefinition(0x02 /* this is the id of the packet */, {
    name: Str, // This is a string field
    user: UInt8 // This is a uint8 field
}, ['name', 'user'] /* This is the order of the fields */)

```

> See Available Data Types section for the different available data types
> See Special Data Types for custom data structures

After defining a packet you then need to add this packet definition to your `BinarySocket` instance. The following code
showcases how to do so.

> Only define packets that you will be receiving to avoid collisions with client packets
> client packet definitions only need to be provided to the `socket.send` function

```typescript
// ...
socket.definePacket(TestPacket)
```

## Sending a packet

The following code shows how to create a send a packet. You must provide the 

```typescript
// ...
socket.send(TestPacket, {
    name: 'Test User',
    user: 2
});
```

### Create a packet without sending
If you want to create a packet ahead of time without actually sending it to the
server, yet you can use the `socket.createBuffer` function to create an ArrayBuffer 
that contains the packet contents which you can later send using `socket.sendBuffer`

```typescript
const buffer = socket.createBuffer(TestPacket, {
    name: 'Test User',
    user: 2
});

// Send the buffer later on
socket.sendBuffer(buffer);
```

## Listening for a packet

The following code shows how to listen for incoming packets on the `BinarySocket`. Note you must first create a packet
definition in order to be able to listen for a packet. This example uses the already created `TestPacket` definition

```typescript
// ...
socket.addListener(TestPacket, ({user, name}) => {
    console.log(user, name)
})
```

## Available Data Types

The following table contains the data types that can be specified along with their types in Javascript and Go. The
javascript contains the range of values on the number types

| Data Type        | Javascript Type                    | Go Type   |
|------------------|------------------------------------|-----------|
| Int8             | number ( -128 to 127)              | int8      |
| Int16            | number (-32768 to 32767)           | int16     |
| Int32            | number (-2147483648 to 2147483647) | int32     |
| UInt8            | number (0 to 255)                  | uint8     |
| UInt16           | number (0 to 65535)                | uint16    |
| UInt32           | number (0 to 4294967295)           | uint32    |
| Float32          | number (-3.4e+38 to 3.4e+38)       | float32   |
| Float64          | number (-1.7e+308 to +1.7e+308)    | float64   |
| VarInt           | number (0 to 18446744073709551615) | uint64    |
| Bool             | boolean                            | bool      |
| Str              | string                             | string    |
| ByteArray        | Uint8Array                         | []byte    |

## Special Data Types

For data that doesn't conform to the average number types, and you want something like a custom struct
or an array of structs you can define them using the following

#### Simple struct

```typescript
import { Str, Struct, UInt8 } from "gowsps-js";

const MyStruct = Struct({
    name: Str,
    value: UInt8
}, ['name', 'value'])
```

#### Array of structs

You can create arrays of a new struct type using the `StructArray` function.
The following code will be equivalent to MyStruct[]

```typescript
import { Str, StructArray, UInt8 } from "gowsps-js";

const MyStruct = StructArray({
    name: Str,
    value: UInt8
}, ['name', 'value'])
```

Or you can create an array of an existing type with the `ArrayType` function.
In the following code the field `values` will be equivalent to string[]. This
will work with any data type including user created structs

```typescript
import { Str, ArrayType, UInt8 } from "gowsps-js";


const TestPacket = new PacketDefinition(0x02, {
    name: Str,
    user: UInt8,
    values: ArrayType(Str)
}, ['name', 'user', 'values'])
```

### Map encodings

If you would like to create a map of key -> value pairs of which the keys are not always
the same you can use the `MapType` DataType generator function

```typescript
import { Str, MapType, UInt32 } from "gowsps-js";

const ScoresPacket = new PacketDefinition(0x09, {
    scores: MapType(Str, UInt32)
}, ['scores'])
```

### Custom encodings

If you want to create a custom data type with a custom encoding you can implement
the `DataType` interface like so. The size function is used to calculate the size
in bytes that a piece of data will take up. 

(e.g. uint8 takes up 1 byte and uint32 takes up 4)

```typescript

export const ExampleType: DataType<ExampleType> = {
    size(value: ExampleType): number {
        return 0 // TODO: Return the size of this data structure
    },
    encode(d: DataView, t: DataViewTracker, v: ExampleType) {
        // Write the value of `v` to the data view `d`
    },
    decode(d: DataView, t: DataViewTracker): ExampleType {
        // Read the value from `d`
        return // TODO: Return the value
    }
}
```