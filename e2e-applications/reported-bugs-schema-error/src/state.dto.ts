export class StateDto {
  installed: number;
}

// Not a DTO, but ts-json-schema-generator throws on it with `type: '*'`
// ("Invalid value used as weak map key"), which drops every schema in the file.
type StatePick = (state: { installed: number }) => number;
const pickInstalled: StatePick = (s) => s.installed;

export const totalInstalled = (states: StateDto[]): number =>
  states.reduce((sum, state) => sum + pickInstalled(state), 0);
