import type { Relation } from '../vendor/orm';
import { Owner } from './owner.entity';

export class Pet {
  id: string;
  owner: Relation<Owner>;
}
