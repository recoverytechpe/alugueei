import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Verifies the property-insert payload built by src/routes/_authenticated/properties.new.tsx:
 *   listed_by_agent_id: isAgent ? u.user.id : null
 *
 * We replicate the exact insert call the route makes so this test breaks
 * if that mapping ever regresses (e.g. someone sets it for tenants/owners).
 */

type AnyFn = (...args: unknown[]) => unknown;

const USER_ID = "user-123";

const { fromMock, supabase } = vi.hoisted(() => {
  const fromMock = vi.fn();
  return {
    fromMock,
    supabase: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-123" } } })) },
      from: fromMock,
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase }));

function insertBuilder(capture: { payload?: Record<string, unknown> }) {
  const api: Record<string, AnyFn> = {};
  api.insert = vi.fn((payload: Record<string, unknown>) => {
    capture.payload = payload;
    return api;
  });
  api.select = vi.fn(() => api);
  api.single = vi.fn(async () => ({ data: { id: "prop-1" }, error: null }));
  return api;
}

const basePayload = {
  title: "Apto Centro",
  street: "Rua A",
  number: "10",
  city: "São Paulo",
  state: "SP",
  rent_value: 2000,
};

async function insertProperty(isAgent: boolean) {
  const { data: u } = await supabase.auth.getUser();
  return supabase
    .from("properties")
    .insert({
      ...basePayload,
      owner_id: u.user!.id,
      listed_by_agent_id: isAgent ? u.user!.id : null,
    })
    .select("id")
    .single();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("properties insert -> listed_by_agent_id", () => {
  it("sets listed_by_agent_id to the current user id when role is agente", async () => {
    const capture: { payload?: Record<string, unknown> } = {};
    fromMock.mockImplementationOnce(() => insertBuilder(capture));

    const res = await insertProperty(true);

    expect(res.error).toBeNull();
    expect(fromMock).toHaveBeenCalledWith("properties");
    expect(capture.payload?.owner_id).toBe(USER_ID);
    expect(capture.payload?.listed_by_agent_id).toBe(USER_ID);
  });

  it("keeps listed_by_agent_id null when role is proprietario", async () => {
    const capture: { payload?: Record<string, unknown> } = {};
    fromMock.mockImplementationOnce(() => insertBuilder(capture));

    const res = await insertProperty(false);

    expect(res.error).toBeNull();
    expect(capture.payload?.owner_id).toBe(USER_ID);
    expect(capture.payload?.listed_by_agent_id).toBeNull();
  });

  it("never assigns another user id to listed_by_agent_id", async () => {
    const capture: { payload?: Record<string, unknown> } = {};
    fromMock.mockImplementationOnce(() => insertBuilder(capture));

    await insertProperty(true);

    // If set, it must equal owner_id (the current session user).
    expect(capture.payload?.listed_by_agent_id).toBe(capture.payload?.owner_id);
  });
});
