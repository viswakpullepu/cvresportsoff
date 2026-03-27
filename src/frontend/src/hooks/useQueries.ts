import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GameTile, Registration, StripeConfiguration } from "../backend";
import { useActor } from "./useActor";

export function useListAllGames() {
  const { actor, isFetching } = useActor();
  return useQuery({
    queryKey: ["allGames"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listAllGames();
    },
    enabled: !!actor && !isFetching,
    staleTime: 5_000,
  });
}

export function useListOpenGames() {
  const { actor } = useActor();
  return useQuery({
    queryKey: ["openGames"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listOpenGames();
    },
    enabled: !!actor,
    staleTime: 5_000,
  });
}

export function useGetGame(gameId: bigint | null) {
  const { actor, isFetching: actorFetching } = useActor();
  const query = useQuery({
    queryKey: ["game", gameId?.toString()],
    queryFn: async () => {
      if (!actor || gameId === null) throw new Error("No actor or gameId");
      return actor.getGame(gameId);
    },
    enabled: !!actor && gameId !== null,
    staleTime: 5_000,
    retry: 2,
  });
  return { ...query, isLoading: query.isLoading || actorFetching };
}

export function useIsAdmin() {
  const { actor, isFetching } = useActor();
  return useQuery({
    queryKey: ["isAdmin"],
    queryFn: async () => {
      if (!actor) return false;
      return actor.isCallerAdmin();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useIsStripeConfigured() {
  const { actor, isFetching } = useActor();
  return useQuery({
    queryKey: ["stripeConfigured"],
    queryFn: async () => {
      if (!actor) return false;
      return actor.isStripeConfigured();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useGetGameRegistrations(gameId: bigint | null) {
  const { actor, isFetching } = useActor();
  return useQuery({
    queryKey: ["gameRegistrations", gameId?.toString()],
    queryFn: async () => {
      if (!actor || gameId === null) return [];
      return actor.getGameRegistrations(gameId);
    },
    enabled: !!actor && !isFetching && gameId !== null,
  });
}

export function useCreateGame() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (game: GameTile) => {
      if (!actor) throw new Error("No actor");
      return actor.createGame(game);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["openGames"] });
      qc.invalidateQueries({ queryKey: ["allGames"] });
    },
  });
}

export function useUpdateGame() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (game: GameTile) => {
      if (!actor) throw new Error("No actor");
      return actor.updateGame(game);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["openGames"] });
      qc.invalidateQueries({ queryKey: ["allGames"] });
    },
  });
}

export function useDeleteGame() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (gameId: bigint) => {
      if (!actor) throw new Error("No actor");
      return actor.deleteGame(gameId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["openGames"] });
      qc.invalidateQueries({ queryKey: ["allGames"] });
    },
  });
}

export function useSubmitRegistration() {
  const { actor } = useActor();
  return useMutation({
    mutationFn: async (reg: Registration) => {
      if (!actor) throw new Error("No actor");
      return actor.submitRegistration(reg);
    },
  });
}

export function useCreateCheckoutSession() {
  const { actor } = useActor();
  return useMutation({
    mutationFn: async ({
      items,
      successUrl,
      cancelUrl,
    }: {
      items: Array<import("../backend").ShoppingItem>;
      successUrl: string;
      cancelUrl: string;
    }) => {
      if (!actor) throw new Error("No actor");
      return actor.createCheckoutSession(items, successUrl, cancelUrl);
    },
  });
}

export function useSetStripeConfiguration() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: StripeConfiguration) => {
      if (!actor) throw new Error("No actor");
      return actor.setStripeConfiguration(config);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stripeConfigured"] }),
  });
}

export function useUpdatePaymentStatus() {
  const { actor } = useActor();
  return useMutation({
    mutationFn: async ({
      regId,
      status,
    }: { regId: bigint; status: string }) => {
      if (!actor) throw new Error("No actor");
      return actor.updatePaymentStatus(regId, status);
    },
  });
}

export function useGetStripeSessionStatus(sessionId: string | null) {
  const { actor, isFetching } = useActor();
  return useQuery({
    queryKey: ["stripeSession", sessionId],
    queryFn: async () => {
      if (!actor || !sessionId) throw new Error("No actor or sessionId");
      return actor.getStripeSessionStatus(sessionId);
    },
    enabled: !!actor && !isFetching && !!sessionId,
    refetchInterval: (query) => {
      if (!query.state.data) return 2000;
      const data = query.state.data;
      if (data.__kind__ === "completed" || data.__kind__ === "failed")
        return false;
      return 2000;
    },
  });
}
