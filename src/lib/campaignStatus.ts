export const isActiveStatus = (status: string) => {
  const s = status.toLowerCase();
  return s === "active" || s.startsWith("active -") || s === "enable";
};

export const isGuardPaused = (status: string) => {
  return status.toLowerCase() === "guard_paused";
};
