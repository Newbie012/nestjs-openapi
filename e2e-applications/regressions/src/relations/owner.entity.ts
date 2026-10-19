import type { Relation } from '../vendor/orm';
import { Pet } from './pet.entity';
import { Profile } from './profile.entity';

export class Owner {
  id: string;
  pet: Relation<Pet> | null;
  profile: Relation<Profile>;
}
