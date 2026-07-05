import React, { createContext, useState, useContext } from 'react';

const LogoContext = createContext();

export function LogoProvider({ children }) {
  const [logo, setLogo] = useState('/images/SAS-LOGO.png'); // Default logo

  return (
    <LogoContext.Provider value={{ logo, setLogo }}>
      {children}
    </LogoContext.Provider>
  );
}

export function useLogo() {
  return useContext(LogoContext);
} 