import React from "react";
import { createRoot } from "react-dom/client";
import { DesktopPetWindow } from "./features/desktopPet/DesktopPetWindow.jsx";

document.documentElement.classList.add("pet-window-mode");

createRoot(document.getElementById("root")).render(<DesktopPetWindow />);
