import React from "react";
import Link from "next/link";
import { FaClipboardList } from "react-icons/fa";
import styles from "../help.module.css";

function HelpWorkflows({ workflows }) {
  return (
    <div className={styles.sectionBlock} role="region" aria-labelledby="workflows-heading">
      <h2 id="workflows-heading" className={styles.sectionTitle}>
        <FaClipboardList className={styles.sectionTitleIcon} aria-hidden />
        Common workflows
      </h2>
      <p className={styles.sectionIntro}>
        Step-by-step paths for everyday tasks. Links jump to the relevant portal area.
      </p>
      <div className={styles.workflowGrid}>
        {workflows.map((workflow) => (
          <div key={workflow.id} className={styles.workflowCard}>
            <div className={styles.workflowCardHeader}>
              <h3 className={styles.workflowTitle}>{workflow.title}</h3>
            </div>
            {workflow.description && (
              <p className={styles.workflowDescription}>{workflow.description}</p>
            )}
            <ol className={styles.workflowSteps}>
              {workflow.steps.map((step, i) => (
                <li key={i} className={styles.workflowStep}>
                  {step.link ? (
                    <>
                      {step.text}{" "}
                      <Link href={step.link}>
                        {step.linkLabel || "Open"}
                      </Link>
                    </>
                  ) : (
                    step.text
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

export default HelpWorkflows;
