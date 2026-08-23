import type { AuthorableStatus } from "../constants.js";
import type { CreatePostInput } from "./social.js";
import type { MediaItem } from "./types.js";

/**
 * Per-platform payload builders.
 *
 * Field names inside each *PostDetails block come from real GHL post objects
 * captured in the Phase 0 spike, not from the API documentation — several
 * differed (tiktok uses enableComment, not allowComment; linkedin uses
 * postAsPdf, not documentPost). GHL ignores unknown keys silently, so a wrong
 * name here would not error; it would just quietly fail to apply the setting.
 */

interface CommonArgs {
  accountIds: string[];
  status: AuthorableStatus;
  summary?: string;
  media?: MediaItem[];
  followUpComment?: string;
}

function common(args: CommonArgs): Omit<CreatePostInput, "platform" | "type" | "details"> {
  return {
    accountIds: args.accountIds,
    status: args.status,
    ...(args.summary !== undefined ? { summary: args.summary } : {}),
    ...(args.media !== undefined ? { media: args.media } : {}),
    ...(args.followUpComment !== undefined ? { followUpComment: args.followUpComment } : {}),
  };
}

export function buildFacebookPost(args: CommonArgs): CreatePostInput {
  return {
    ...common(args),
    platform: "facebook",
    type: "post",
    details: { facebookPostDetails: { type: "post" } },
  };
}

export interface InstagramArgs extends CommonArgs {
  media: MediaItem[];
  postType: "post" | "reel" | "story";
}

export function buildInstagramPost(args: InstagramArgs): CreatePostInput {
  return {
    ...common(args),
    platform: "instagram",
    type: args.postType,
    details: { instagramPostDetails: { type: args.postType } },
  };
}

export interface YoutubeArgs extends CommonArgs {
  media: MediaItem[];
  title: string;
  privacy: "public" | "unlisted" | "private";
}

export function buildYoutubePost(args: YoutubeArgs): CreatePostInput {
  return {
    ...common(args),
    platform: "youtube",
    type: "post",
    details: {
      youtubePostDetails: { title: args.title, privacyLevel: args.privacy, type: "video" },
    },
  };
}

export interface LinkedinArgs extends CommonArgs {
  postAsPdf?: boolean;
  pdfTitle?: string;
}

export function buildLinkedinPost(args: LinkedinArgs): CreatePostInput {
  return {
    ...common(args),
    platform: "linkedin",
    type: "post",
    details: {
      linkedinPostDetails: {
        ...(args.postAsPdf !== undefined ? { postAsPdf: args.postAsPdf } : {}),
        ...(args.pdfTitle !== undefined ? { pdfTitle: args.pdfTitle } : {}),
      },
    },
  };
}

export interface TiktokArgs extends CommonArgs {
  media: MediaItem[];
  privacyLevel: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
  allowComments: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
}

export function buildTiktokPost(args: TiktokArgs): CreatePostInput {
  return {
    ...common(args),
    platform: "tiktok",
    type: "post",
    details: {
      tiktokPostDetails: {
        privacyLevel: args.privacyLevel,
        enableComment: args.allowComments,
        enableDuet: args.allowDuet,
        enableStitch: args.allowStitch,
      },
    },
  };
}
