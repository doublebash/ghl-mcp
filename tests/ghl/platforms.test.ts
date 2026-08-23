import { describe, expect, it } from "vitest";
import {
  buildFacebookPost,
  buildInstagramPost,
  buildLinkedinPost,
  buildTiktokPost,
  buildYoutubePost,
} from "../../src/ghl/platforms.js";

// Field names below are taken from real GHL post objects captured in the Phase 0
// spike (tests/fixtures/social/list-posts-draft.json) — not from documentation.
const media = [{ url: "https://example.com/a.jpg" }];

describe("buildFacebookPost", () => {
  it("produces a text-only post with no media key", () => {
    const input = buildFacebookPost({ accountIds: ["fb-1"], summary: "hi", status: "draft" });

    expect(input.platform).toBe("facebook");
    expect(input.type).toBe("post");
    expect(input.media).toBeUndefined();
    expect(input.details).toEqual({ facebookPostDetails: { type: "post" } });
  });

  it("carries media and a follow-up comment through", () => {
    const input = buildFacebookPost({
      accountIds: ["fb-1"],
      summary: "hi",
      status: "published",
      media,
      followUpComment: "first!",
    });

    expect(input.media).toEqual(media);
    expect(input.followUpComment).toBe("first!");
  });
});

describe("buildInstagramPost", () => {
  it("maps postType onto both the post type and the details block", () => {
    const input = buildInstagramPost({
      accountIds: ["ig-1"],
      summary: "hi",
      status: "draft",
      media,
      postType: "reel",
    });

    expect(input.platform).toBe("instagram");
    expect(input.type).toBe("reel");
    expect(input.details).toEqual({ instagramPostDetails: { type: "reel" } });
  });
});

describe("buildYoutubePost", () => {
  it("uses privacyLevel and type video, as GHL returns them", () => {
    const input = buildYoutubePost({
      accountIds: ["yt-1"],
      title: "My video",
      status: "draft",
      privacy: "unlisted",
      media,
    });

    expect(input.details).toEqual({
      youtubePostDetails: { title: "My video", privacyLevel: "unlisted", type: "video" },
    });
  });
});

describe("buildLinkedinPost", () => {
  // GHL's field is postAsPdf with a companion pdfTitle — not the documentPost
  // the plan assumed before the fixtures were captured.
  it("marks a PDF carousel with postAsPdf and a title", () => {
    const input = buildLinkedinPost({
      accountIds: ["li-1"],
      summary: "deck",
      status: "draft",
      media,
      postAsPdf: true,
      pdfTitle: "Q3 deck",
    });

    expect(input.details).toEqual({
      linkedinPostDetails: { postAsPdf: true, pdfTitle: "Q3 deck" },
    });
  });

  it("omits the pdf fields entirely for an ordinary post", () => {
    const input = buildLinkedinPost({ accountIds: ["li-1"], summary: "text", status: "draft" });
    expect(input.details).toEqual({ linkedinPostDetails: {} });
  });
});

describe("buildTiktokPost", () => {
  // enableComment / enableDuet / enableStitch — the plan had allowComment etc.,
  // which GHL would have ignored silently, leaving TikTok's own defaults in place.
  it("uses the enable* interaction field names", () => {
    const input = buildTiktokPost({
      accountIds: ["tt-1"],
      summary: "hi",
      status: "draft",
      media,
      privacyLevel: "PUBLIC_TO_EVERYONE",
      allowComments: true,
      allowDuet: false,
      allowStitch: false,
    });

    expect(input.details).toEqual({
      tiktokPostDetails: {
        privacyLevel: "PUBLIC_TO_EVERYONE",
        enableComment: true,
        enableDuet: false,
        enableStitch: false,
      },
    });
  });
});
