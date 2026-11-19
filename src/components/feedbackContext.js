import { createContext, useContext } from "react";

export const FeedbackContext = createContext(null);

export function useFeedback() {
  const context = useContext(FeedbackContext);

  if (!context) {
    throw new Error("useFeedback нужно вызывать внутри FeedbackProvider");
  }

  return context;
}
