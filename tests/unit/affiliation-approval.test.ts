import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mocks the Supabase client used by getOrCreateConversation.
 * We assert two flows:
 *  1. an existing conversation between owner<->agent for the property is reused
 *  2. no existing row -> a new conversation is inserted and its id returned
 *
 * Then we simulate the approval flow used by ApproveDialog/OwnerView:
 *  - update property_affiliations -> approved
 *  - getOrCreateConversation(...)
 *  - update conversations.contacts_unlocked = true
 *  - navigate({ to: "/chat/$id", params: { id } })
 */

type AnyFn = (...args: unknown[]) => unknown;

const auth = { getUser: vi.fn() };
const fromMock = vi.fn();
const supabase = { auth, from: fromMock };

vi.mock("@/integrations/supabase/client", () => ({ supabase }));

import { getOrCreateConversation } from "@/lib/chat-helpers";

const OWNER = "owner-1";
const AGENT = "agent-1";
const PROPERTY = "prop-1";
const CONV_EXISTING = "conv-existing";
const CONV_NEW = "conv-new";

function selectBuilder(existingRow: { id: string } | null) {
  // chain: .select().eq().or().maybeSingle()
  const api: Record<string, AnyFn> = {};
  api.select = vi.fn(() => api);
  api.eq = vi.fn(() => api);
  api.or = vi.fn(() => api);
  api.maybeSingle = vi.fn(async () => ({ data: existingRow, error: null }));
  return api;
}

function insertBuilder(insertedId: string) {
  const api: Record<string, AnyFn> = {};
  api.insert = vi.fn(() => api);
  api.select = vi.fn(() => api);
  api.single = vi.fn(async () => ({ data: { id: insertedId }, error: null }));
  return api;
}

function updateBuilder() {
  const api: Record<string, AnyFn> = {};
  api.update = vi.fn(() => api);
  api.eq = vi.fn(async () => ({ data: null, error: null }));
  return api;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getUser.mockResolvedValue({ data: { user: { id: OWNER } } });
});

describe("getOrCreateConversation", () => {
  it("returns id of an existing conversation between the two users", async () => {
    fromMock.mockImplementationOnce(() => selectBuilder({ id: CONV_EXISTING }));
    const id = await getOrCreateConversation({ propertyId: PROPERTY, otherUserId: AGENT });
    expect(id).toBe(CONV_EXISTING);
    expect(fromMock).toHaveBeenCalledWith("conversations");
  });

  it("creates a new conversation when none exists", async () => {
    fromMock
      .mockImplementationOnce(() => selectBuilder(null))
      .mockImplementationOnce(() => insertBuilder(CONV_NEW));
    const id = await getOrCreateConversation({ propertyId: PROPERTY, otherUserId: AGENT });
    expect(id).toBe(CONV_NEW);
    expect(fromMock).toHaveBeenNthCalledWith(1, "conversations");
    expect(fromMock).toHaveBeenNthCalledWith(2, "conversations");
  });
});

describe("affiliation approval -> open chat flow", () => {
  it("approves affiliation, unlocks contacts, and navigates to /chat/$id", async () => {
    const affiliationUpdate = updateBuilder();
    const convoUnlockUpdate = updateBuilder();

    fromMock
      // 1) UPDATE property_affiliations -> approved
      .mockImplementationOnce(() => affiliationUpdate)
      // 2) SELECT conversations (existing lookup) -> none
      .mockImplementationOnce(() => selectBuilder(null))
      // 3) INSERT conversations -> new id
      .mockImplementationOnce(() => insertBuilder(CONV_NEW))
      // 4) UPDATE conversations -> contacts_unlocked
      .mockImplementationOnce(() => convoUnlockUpdate);

    const navigate = vi.fn();

    // Mirrors ApproveDialog.approve() + OwnerView.chatWith()
    async function approveAndOpenChat() {
      const upd = await supabase
        .from("property_affiliations")
        .update({ status: "approved" })
        .eq("id", "aff-1");
      expect(upd.error).toBeNull();

      const cid = await getOrCreateConversation({ propertyId: PROPERTY, otherUserId: AGENT });
      await supabase.from("conversations").update({ contacts_unlocked: true }).eq("id", cid);
      navigate({ to: "/chat/$id", params: { id: cid } });
    }

    await approveAndOpenChat();

    expect(affiliationUpdate.update).toHaveBeenCalledWith({ status: "approved" });
    expect(affiliationUpdate.eq).toHaveBeenCalledWith("id", "aff-1");

    expect(convoUnlockUpdate.update).toHaveBeenCalledWith({ contacts_unlocked: true });
    expect(convoUnlockUpdate.eq).toHaveBeenCalledWith("id", CONV_NEW);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ to: "/chat/$id", params: { id: CONV_NEW } });
  });

  it("does not navigate if affiliation update fails", async () => {
    const failingUpdate: Record<string, AnyFn> = {};
    failingUpdate.update = vi.fn(() => failingUpdate);
    failingUpdate.eq = vi.fn(async () => ({ data: null, error: { message: "denied" } }));
    fromMock.mockImplementationOnce(() => failingUpdate);

    const navigate = vi.fn();
    const res = await supabase
      .from("property_affiliations")
      .update({ status: "approved" })
      .eq("id", "aff-1");

    if (!res.error) navigate({ to: "/chat/$id", params: { id: "x" } });

    expect(res.error).toEqual({ message: "denied" });
    expect(navigate).not.toHaveBeenCalled();
  });
});
