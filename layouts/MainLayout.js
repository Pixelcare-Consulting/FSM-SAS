import React from 'react';
import FooterWithSocialIcons from "@/layouts/marketing/footers/FooterWithSocialIcons";

const MainLayout = ({ children, showFooter = true }) => {
  return (
    // <div className="flex flex-col min-h-screen">
    //   <main className="flex-grow flex flex-col">
    <div>
      <main>
        {children}
      </main>
      {showFooter && <FooterWithSocialIcons />}
    </div>
  );
};

export default MainLayout;