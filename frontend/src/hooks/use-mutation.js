import { useCallback, useState } from "react";

/**
 * Minimal stand-in for @tanstack/react-query's useMutation, covering the
 * one thing this app needs: fire an async function, track pending/error/
 * data state, and expose a `.mutate()` that swallows its own rejections
 * (the caller reads `isError` / `error` instead of using try/catch).
 */
export function useMutation({ mutationFn }) {
  const [state, setState] = useState({
    status: "idle", // "idle" | "pending" | "error" | "success"
    data: undefined,
    error: undefined,
  });

  const mutate = useCallback(
    async (variables) => {
      setState({ status: "pending", data: undefined, error: undefined });
      try {
        const data = await mutationFn(variables);
        setState({ status: "success", data, error: undefined });
        return data;
      } catch (error) {
        setState({ status: "error", data: undefined, error });
        return undefined;
      }
    },
    [mutationFn],
  );

  return {
    mutate,
    data: state.data,
    error: state.error,
    isPending: state.status === "pending",
    isError: state.status === "error",
    isSuccess: state.status === "success",
  };
}
