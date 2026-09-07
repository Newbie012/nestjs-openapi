/**
 * Enums defined in a separate file (simulates enums from external packages)
 */

export enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
  Yellow = 'yellow',
}

export enum Priority {
  NONE = 0,
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4,
}

export enum Size {
  Small = 'S',
  Medium = 'M',
  Large = 'L',
  ExtraLarge = 'XL',
}

/**
 * Single-member enum: TypeScript collapses its declared type to the member
 * literal, so schema naming must walk back up to the enum declaration.
 */
export enum Channel {
  Email = 'email',
}
