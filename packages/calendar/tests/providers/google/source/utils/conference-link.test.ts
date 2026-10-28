import { describe, expect, it } from "vitest";
import { parseGoogleEvents } from "../../../../../src/providers/google/source/utils/fetch-events";
import type { GoogleCalendarEvent } from "../../../../../src/providers/google/source/types";
import { createSyncEventContentHash } from "../../../../../src/core/events/content-hash";

const createGoogleEvent = (overrides: Partial<GoogleCalendarEvent>): GoogleCalendarEvent => ({
  end: {
    dateTime: "2026-03-08T15:00:00.000Z",
    timeZone: "America/Toronto",
  },
  iCalUID: "external-uid-1",
  id: "google-event-id-1",
  start: {
    dateTime: "2026-03-08T14:00:00.000Z",
    timeZone: "America/Toronto",
  },
  status: "confirmed",
  summary: "Planning Session",
  ...overrides,
});

const parse = (overrides: Partial<GoogleCalendarEvent>): string | undefined => {
  const [parsed] = parseGoogleEvents([createGoogleEvent(overrides)]);
  if (!parsed) {
    throw new Error("Expected a parsed event");
  }
  return parsed.description;
};

describe("resolveGoogleDescription", () => {
  it("appends a Meet link from hangoutLink to the existing description", () => {
    const description = parse({
      description: "Quarterly sync",
      hangoutLink: "https://meet.google.com/abc-defg-hij",
    });

    expect(description).toBe(
      "Quarterly sync\n\nJoin Google Meet: https://meet.google.com/abc-defg-hij",
    );
  });

  it("uses a video entry point while ignoring dial-in entries", () => {
    const description = parse({
      description: "Standup",
      conferenceData: {
        entryPoints: [
          { entryPointType: "phone", uri: "tel:+1-555-0100" },
          { entryPointType: "video", uri: "https://zoom.us/j/123456789" },
          { entryPointType: "more", uri: "https://example.com/more" },
        ],
      },
    });

    expect(description).toBe("Standup\n\nJoin video meeting: https://zoom.us/j/123456789");
  });

  it("prefers hangoutLink over a conference entry point", () => {
    const description = parse({
      description: "Review",
      hangoutLink: "https://meet.google.com/xyz-1234-abc",
      conferenceData: {
        entryPoints: [{ entryPointType: "video", uri: "https://zoom.us/j/999" }],
      },
    });

    expect(description).toBe(
      "Review\n\nJoin Google Meet: https://meet.google.com/xyz-1234-abc",
    );
  });

  it("uses the link as the whole description when none exists", () => {
    const description = parse({
      hangoutLink: "https://meet.google.com/abc-defg-hij",
    });

    expect(description).toBe("Join Google Meet: https://meet.google.com/abc-defg-hij");
  });

  it("treats an empty description as no existing description", () => {
    const description = parse({
      description: "",
      hangoutLink: "https://meet.google.com/abc-defg-hij",
    });

    expect(description).toBe("Join Google Meet: https://meet.google.com/abc-defg-hij");
  });

  it("does not append a link already present in the description", () => {
    const description = parse({
      description: "Join here: https://meet.google.com/abc-defg-hij",
      hangoutLink: "https://meet.google.com/abc-defg-hij",
    });

    expect(description).toBe("Join here: https://meet.google.com/abc-defg-hij");
  });

  it("leaves the description unchanged when there is no conference link", () => {
    const description = parse({
      description: "Just a meeting",
    });

    expect(description).toBe("Just a meeting");
  });

  it("returns an undefined description unchanged when there is no conference link", () => {
    const description = parse({});

    expect(description).toBeUndefined();
  });

  it("falls back to a valid video entry point when hangoutLink is invalid", () => {
    const description = parse({
      description: "Catch up",
      hangoutLink: "not a url",
      conferenceData: {
        entryPoints: [{ entryPointType: "video", uri: "https://zoom.us/j/555" }],
      },
    });

    expect(description).toBe("Catch up\n\nJoin video meeting: https://zoom.us/j/555");
  });

  it("skips non-HTTP(S) candidates entirely", () => {
    const description = parse({
      description: "Dial-in only",
      hangoutLink: "ftp://files.example.com/meeting",
      conferenceData: {
        entryPoints: [{ entryPointType: "video", uri: "tel:+1-555-0100" }],
      },
    });

    expect(description).toBe("Dial-in only");
  });

  it("does not mutate the source Google event", () => {
    const event = createGoogleEvent({
      description: "Original",
      hangoutLink: "https://meet.google.com/abc-defg-hij",
    });
    const before = structuredClone(event);

    parseGoogleEvents([event]);

    expect(event).toEqual(before);
  });

  it("produces distinct content hashes for changed, removed, and present conference links", () => {
    const [present] = parseGoogleEvents([
      createGoogleEvent({
        description: "Weekly",
        hangoutLink: "https://meet.google.com/abc-defg-hij",
      }),
    ]);
    const [changed] = parseGoogleEvents([
      createGoogleEvent({
        description: "Weekly",
        hangoutLink: "https://meet.google.com/zzz-yyyy-xxx",
      }),
    ]);
    const [removed] = parseGoogleEvents([
      createGoogleEvent({ description: "Weekly" }),
    ]);

    if (!present || !changed || !removed) {
      throw new Error("Expected three parsed events");
    }

    const toHash = (event: typeof present): string =>
      createSyncEventContentHash({ ...event, summary: event.title ?? "" });

    const presentHash = toHash(present);
    const changedHash = toHash(changed);
    const removedHash = toHash(removed);

    expect(new Set([presentHash, changedHash, removedHash]).size).toBe(3);
  });
});
