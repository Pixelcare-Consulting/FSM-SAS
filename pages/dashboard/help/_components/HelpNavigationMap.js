import React from "react";
import Link from "next/link";
import { FaMapSigns } from "react-icons/fa";
import styles from "../help.module.css";

function HelpNavigationMap({ sections }) {
  return (
    <div className={styles.sectionBlock} role="region" aria-labelledby="nav-map-heading">
      <h2 id="nav-map-heading" className={styles.sectionTitle}>
        <FaMapSigns className={styles.sectionTitleIcon} aria-hidden />
        Portal navigation map
      </h2>
      <p className={styles.sectionIntro}>
        Every main menu and user-menu destination with a short description. Admin-only items are marked.
      </p>
      {sections.map((section) => (
        <div key={section.id} className={styles.navSection}>
          <h3 className={styles.navSectionTitle}>{section.title}</h3>
          {section.description && (
            <p className={styles.navSectionDesc}>{section.description}</p>
          )}
          <div className={styles.navGrid}>
            {section.items.map((item) => {
              const route = item.route || item.href;
              return (
                <div key={(route || item.label) + item.label} className={styles.navCard}>
                  <div className={styles.navCardHeader}>
                    {route ? (
                      <Link href={route} className={styles.navCardLink}>
                        {item.label}
                      </Link>
                    ) : (
                      <span className={styles.navCardLinkStatic}>{item.label}</span>
                    )}
                    {item.adminOnly && (
                      <span className={styles.adminBadge}>Admin</span>
                    )}
                    {item.badge && !item.adminOnly && (
                      <span className={styles.navBadge}>{item.badge}</span>
                    )}
                  </div>
                  <p className={styles.navCardDesc}>{item.description}</p>
                  {route && <code className={styles.navCardRoute}>{route}</code>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default HelpNavigationMap;
