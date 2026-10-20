import type { Node, Type } from 'ts-morph';

const SYNTAX_CHARACTERS = /[|,<>(){}[\]:;&]/g;

const isEnumMember = (type: Type): boolean =>
  type.isEnumLiteral() && (type.isStringLiteral() || type.isNumberLiteral());

const literalText = (value: string | number): string =>
  typeof value === 'number'
    ? String(value)
    : JSON.stringify(value).replace(
        SYNTAX_CHARACTERS,
        (character) =>
          `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
      );

const enumMembers = (type: Type): readonly Type[] | undefined => {
  if (isEnumMember(type)) return [type];
  if (!type.isUnion()) return undefined;
  const members = type.getUnionTypes();
  return members.length > 0 && members.every(isEnumMember)
    ? members
    : undefined;
};

const membersText = (members: readonly Type[]): string =>
  members
    .map((member) => literalText(member.getLiteralValue() as string | number))
    .join(' | ');

const NAMED_TYPE = /^[A-Za-z_$][\w$]*$/;

const describeEnumMembers = (
  type: Type,
  members: readonly Type[],
  node: Node,
  expandWholeEnum: boolean,
): string => {
  const text = type.getText(node);
  return NAMED_TYPE.test(text) && !expandWholeEnum
    ? text
    : membersText(members);
};

const describeArgument = (
  type: Type,
  node: Node,
  expandWholeEnum: boolean,
): string => {
  const members = enumMembers(type);
  return members === undefined
    ? describeSchemaType(type, node)
    : describeEnumMembers(type, members, node, expandWholeEnum);
};

/**
 * Prints a type for schema building. A union of enum members, or one member,
 * is written as its literal values, and the key of a `Record` as its values
 * even for a whole enum. A whole enum, or an enum with a single member, keeps
 * its name. Everything else keeps the type checker's text
 */
export const describeSchemaType = (type: Type, node: Node): string => {
  const members = enumMembers(type);
  if (members !== undefined) {
    return describeEnumMembers(type, members, node, false);
  }
  const alias = type.getAliasSymbol()?.getName();
  const args = type.getAliasTypeArguments();
  if (alias === 'Record' && args.length === 2) {
    const key = describeArgument(args[0], node, true);
    const value = describeArgument(args[1], node, false);
    return `Record<${key}, ${value}>`;
  }
  if (alias === 'Partial' && args.length === 1) {
    return `Partial<${describeArgument(args[0], node, false)}>`;
  }
  return type.getText(node);
};
