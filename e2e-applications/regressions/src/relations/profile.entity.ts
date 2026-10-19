import type { Relation } from '../vendor/orm';
import { Owner } from './owner.entity';

export class Profile {
  bio: string;
  owner: Relation<Owner>;
}
