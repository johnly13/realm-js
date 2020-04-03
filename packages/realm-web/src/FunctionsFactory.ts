import { Transport } from "./transports/Transport";

/**
 * A list of names that functions cannot have to be callable through the functions proxy.
 */
const RESERVED_NAMES = ["inspect", "callFunction"];

interface CallFunctionBody {
    name: string;
    arguments: any[];
    service?: string;
}

export interface FunctionsFactoryConfiguration {
    transport: Transport;
    serviceName?: string;
    argsTransformation?: (args: any[]) => any[];
    responseTransformation?: (response: any) => any;
}

// Remove the key for any fields with undefined values
function cleanArgs(args: any[]) {
    for (const arg of args) {
        if (typeof arg === "object") {
            for (const [key, value] of Object.entries(arg)) {
                if (value === undefined) {
                    delete arg[key];
                }
            }
        }
    }
    return args;
}

/**
 * Defines how functions are called
 */
export class FunctionsFactory {
    private readonly transport: Transport;
    private readonly serviceName?: string;
    private readonly argsTransformation?: (args: any[]) => any[];
    private readonly responseTransformation?: (response: any) => any;

    constructor({
        transport,
        serviceName = "",
        argsTransformation = cleanArgs,
        responseTransformation
    }: FunctionsFactoryConfiguration) {
        this.transport = transport;
        this.serviceName = serviceName;
        this.argsTransformation = argsTransformation;
        this.responseTransformation = responseTransformation;
    }

    /**
     * Call a remote function by it's name
     * @param name Name of the remote function
     * @param args Arguments to pass to the remote function
     */
    async callFunction(name: string, ...args: any[]): Promise<any> {
        // See https://github.com/mongodb/stitch-js-sdk/blob/master/packages/core/sdk/src/services/internal/CoreStitchServiceClientImpl.ts
        const body: CallFunctionBody = {
            name,
            arguments: this.argsTransformation
                ? this.argsTransformation(args)
                : args
        };
        if (this.serviceName) {
            body.service = this.serviceName;
        }
        const response = await this.transport.fetch({
            method: "POST",
            path: "/functions/call",
            body
        });
        // Transform the response, if needed
        if (this.responseTransformation) {
            return this.responseTransformation(response);
        } else {
            return response;
        }
    }
}

/**
 * Create a factory of functions
 * @param fetcher The object used to perform HTTP fetching
 * @param serviceName An optional name of the service to call functions on
 */
export function create<FF extends Realm.FunctionsFactory>(
    config: FunctionsFactoryConfiguration
): FF {
    // Create a proxy, wrapping a simple object returning methods that calls functions
    // TODO: Lazily fetch available functions and return these from the ownKeys() trap
    const factory = new FunctionsFactory(config);
    // Wrap the factory in a promise that calls the internal call method
    return new Proxy((factory as any) as FF, {
        get(target, p, receiver) {
            if (typeof p === "string" && RESERVED_NAMES.indexOf(p) === -1) {
                return target.callFunction.bind(target, p);
            } else {
                return Reflect.get(target, p, receiver);
            }
        }
    });
}
