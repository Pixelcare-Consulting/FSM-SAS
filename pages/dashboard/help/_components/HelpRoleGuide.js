import React, { useState } from "react";
import Link from "next/link";
import { FaChevronDown, FaChevronRight, FaUserShield } from "react-icons/fa";
import styles from "../help.module.css";

function HelpRoleGuide({ roles }) {
  const [openId, setOpenId] = useState(roles[0]?.id ?? null);

  return (
    <div className={styles.sectionBlock} role="region" aria-labelledby="role-guide-heading">
      <h2 id="role-guide-heading" className={styles.sectionTitle}>
        <FaUserShield className={styles.sectionTitleIcon} aria-hidden />
        Guide by role
      </h2>
      <p className={styles.sectionIntro}>
        What you can access depends on your account role. Expand a section for details.
      </p>
      <div className={styles.roleAccordion}>
        {roles.map((role) => {
          const Icon = role.icon;
          const isOpen = openId === role.id;
          return (
            <div
              key={role.id}
              className={`${styles.roleCard} ${isOpen ? styles.roleCardOpen : ""}`}
            >
              <button
                type="button"
                className={styles.roleTrigger}
                onClick={() => setOpenId(isOpen ? null : role.id)}
                aria-expanded={isOpen}
              >
                <span className={styles.roleChevron}>
                  {isOpen ? <FaChevronDown /> : <FaChevronRight />}
                </span>
                {Icon && <Icon className={styles.roleSectionIcon} aria-hidden />}
                <span className={styles.roleTitle}>{role.title}</span>
              </button>
              <div className={styles.roleContent} hidden={!isOpen} aria-hidden={!isOpen}>
                {role.description && (
                  <p className={styles.roleDescription}>{role.description}</p>
                )}
                <ul className={styles.roleList}>
                  {role.bullets.map((bullet, i) => (
                    <li key={i}>{bullet}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
      <p className={styles.roleNote}>
        Memos and company memo settings are visible only to administrators. See{" "}
        <Link href="/dashboard/company-memos">Memos</Link> if you have admin access.
      </p>
    </div>
  );
}

export default HelpRoleGuide;
