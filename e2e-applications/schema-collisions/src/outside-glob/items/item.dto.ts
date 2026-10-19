export interface ItemDto {
  id: string;
  label: string;
}

export class ItemListDto {
  items: ItemDto[];
}
