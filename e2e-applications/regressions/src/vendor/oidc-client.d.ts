// Library typings built from mapped types (`Override`, `KnownKeys`) that
// ts-json-schema-generator cannot index
interface UnknownObject {
  [key: string]: unknown;
}

type KnownKeys<T> = {
  [K in keyof T]: string extends K ? never : number extends K ? never : K;
} extends { [_ in keyof T]: infer U }
  ? Record<never, never> extends U
    ? never
    : U
  : never;

type Override<T1, T2> = Omit<T1, keyof Omit<T2, keyof KnownKeys<T2>>> & T2;

export type Address<ExtendedAddress extends object = UnknownObject> = Override<
  {
    formatted?: string;
    country?: string;
  },
  ExtendedAddress
>;

export type UserinfoResponse<
  UserProfile extends object = UnknownObject,
  ExtendedAddress extends object = UnknownObject,
> = Override<
  {
    sub: string;
    email?: string;
    email_verified?: boolean;
    address?: Address<ExtendedAddress>;
  },
  UserProfile
>;
