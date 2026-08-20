import { ProfileOverview } from './profile';
import { UserSocialLinks } from './profile-user';

export interface PublicProfileUser {
  id: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  socialLinks: UserSocialLinks;
  createdAt: string;
}

export interface PublicUserProfile extends ProfileOverview {
  user: PublicProfileUser;
}
