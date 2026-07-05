import React, { useState } from "react";
import { FaChevronDown, FaChevronRight, FaQuestionCircle } from "react-icons/fa";
import styles from "./HelpFaqAccordion.module.css";

const HelpFaqAccordion = ({ items }) => {
  const [openId, setOpenId] = useState(null);

  return (
    <div className={styles.faqAccordion}>
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div
            key={item.id}
            className={`${styles.faqCard} ${isOpen ? styles.faqCardOpen : ""}`}
          >
            <button
              type="button"
              className={styles.faqTrigger}
              onClick={() => setOpenId(isOpen ? null : item.id)}
              aria-expanded={isOpen}
              aria-controls={`faq-answer-${item.id}`}
              id={`faq-question-${item.id}`}
            >
              <span className={styles.faqTriggerIcon}>
                {isOpen ? (
                  <FaChevronDown className={styles.chevron} aria-hidden />
                ) : (
                  <FaChevronRight className={styles.chevron} aria-hidden />
                )}
              </span>
              <FaQuestionCircle className={styles.faqIcon} aria-hidden />
              <span className={styles.faqQuestion}>{item.question}</span>
            </button>
            <div
              id={`faq-answer-${item.id}`}
              className={styles.faqContent}
              hidden={!isOpen}
              aria-hidden={!isOpen}
              role="region"
              aria-labelledby={`faq-question-${item.id}`}
            >
              <p className={styles.faqAnswer}>{item.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default HelpFaqAccordion;
