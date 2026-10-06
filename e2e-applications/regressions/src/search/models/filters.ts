export class FilterOption<T> {
  value: T;
  label: string;
}

export class DateRangeOptions {
  days: number;
}

export class SearchFiltersDto {
  dateRange: FilterOption<DateRangeOptions>;
}
