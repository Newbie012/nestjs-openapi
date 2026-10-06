// Stands in for a decorator library shipped as compiled JavaScript
export declare function LibOptional(): PropertyDecorator;
export declare function LibHidden(): MethodDecorator;
export declare function LibPaged(type?: unknown): MethodDecorator;
// Same signature as class-transformer's @Type()
export declare function Type(typeFunction: () => unknown): PropertyDecorator;
