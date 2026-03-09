import { GraphQLScalarType, Kind } from 'graphql';

function parseDate(value: string): Date {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new TypeError(`DateTime cannot parse invalid date: ${value}`);
  }
  return date;
}

export const DateTimeScalar = new GraphQLScalarType<Date, string>({
  name: 'DateTime',
  description: 'ISO 8601 date-time string',
  serialize(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    throw new TypeError(`DateTime cannot serialize non-Date value: ${value}`);
  },
  parseValue(value: unknown): Date {
    if (typeof value === 'string') return parseDate(value);
    throw new TypeError(`DateTime cannot parse non-string value: ${value}`);
  },
  parseLiteral(ast): Date {
    if (ast.kind === Kind.STRING) return parseDate(ast.value);
    throw new TypeError(`DateTime cannot represent non-string type: ${ast.kind}`);
  },
});
