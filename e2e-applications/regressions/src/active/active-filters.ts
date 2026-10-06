export class FilterOption<T> {
  option: T;
  count: number;
}

export class PriorityLevelDto {
  level: string;
}

export class ActiveFiltersDto {
  priorityLevels: FilterOption<PriorityLevelDto>[];
}
