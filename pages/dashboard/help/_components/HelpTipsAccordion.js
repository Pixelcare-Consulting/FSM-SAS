import React, { useState } from "react";
import Link from "next/link";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import styles from "./HelpTipsAccordion.module.css";

const HelpTipsAccordion = ({ sections }) => {
  const [openId, setOpenId] = useState(sections[0]?.title ?? null);

  return (
    <div className={styles.accordion}>
      {sections.map((section) => {
        const Icon = section.icon;
        const isOpen = openId === section.title;
        return (
          <div
            key={section.title}
            className={`${styles.card} ${isOpen ? styles.cardOpen : ""}`}
          >
            <button
              type="button"
              className={styles.trigger}
              onClick={() => setOpenId(isOpen ? null : section.title)}
              aria-expanded={isOpen}
            >
              <span className={styles.triggerIcon}>
                {isOpen ? (
                  <FaChevronDown className={styles.chevron} />
                ) : (
                  <FaChevronRight className={styles.chevron} />
                )}
              </span>
              <Icon className={styles.sectionIcon} aria-hidden />
              <span className={styles.triggerTitle}>{section.title}</span>
              {section.link && (
                <Link
                  href={section.link}
                  className={styles.openLink}
                  onClick={(e) => e.stopPropagation()}
                >
                  Open
                </Link>
              )}
            </button>
            <div
              className={styles.content}
              hidden={!isOpen}
              aria-hidden={!isOpen}
            >
              {section.items && (
                <ul className={styles.itemList}>
                  {section.items.map((item) => (
                    <li key={item.label} className={styles.item}>
                      <Link href={item.link} className={styles.itemLabel}>
                        {item.label}
                      </Link>
                      <span className={styles.itemTip}>{item.tip}</span>
                    </li>
                  ))}
                </ul>
              )}
              <ul className={styles.tipList}>
                {section.tips.map((tip, i) => (
                  <li key={i} className={styles.tip}>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default HelpTipsAccordion;
