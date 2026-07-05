import React from "react";
import { Col, Placeholder, Row, Spinner } from "react-bootstrap";
import styles from "./EditJobFormSkeleton.module.css";

const TAB_LABELS = ["Job Summary", "Job Task", "Job Scheduling"];

function SkeletonField({ md = 4, labelWidth = 4 }) {
  return (
    <Col md={md} className="mb-3">
      <Placeholder as="div" animation="glow" className="mb-2">
        <Placeholder xs={labelWidth} className={styles.label} />
      </Placeholder>
      <Placeholder as="div" animation="glow">
        <Placeholder xs={12} className={styles.input} />
      </Placeholder>
    </Col>
  );
}

export default function EditJobFormSkeleton({
  message = "Please wait while we load the data",
  subMessage = "Loading customers, workers, job statuses, and schedule options.",
}) {
  return (
    <div className={styles.wrapper} aria-busy="true" aria-live="polite">
      <div className={styles.notice}>
        <Spinner animation="border" variant="primary" size="sm" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <div>
          <div className={styles.noticeTitle}>{message}</div>
          <div className={styles.noticeSubtext}>{subMessage}</div>
        </div>
      </div>

      <div className={styles.tabs} aria-hidden="true">
        {TAB_LABELS.map((label, index) => (
          <div
            key={label}
            className={`${styles.tab} ${index === 0 ? styles.tabActive : ""}`}
          >
            {label}
          </div>
        ))}
      </div>

      <Row className="mb-3">
        <SkeletonField md={7} labelWidth={3} />
      </Row>

      <hr className="my-4" />

      <Placeholder as="div" animation="glow" className="mb-2">
        <Placeholder xs={3} className={styles.sectionTitle} />
      </Placeholder>
      <Placeholder as="div" animation="glow" className="mb-4">
        <Placeholder xs={5} className={styles.sectionSubtitle} />
      </Placeholder>

      <Row className="mb-3">
        <SkeletonField md={3} />
        <SkeletonField md={3} />
        <SkeletonField md={3} />
        <SkeletonField md={3} />
      </Row>

      <Row className="mb-3">
        <SkeletonField md={6} />
        <SkeletonField md={6} />
      </Row>

      <Row className="mb-3">
        <SkeletonField md={4} />
        <SkeletonField md={4} />
        <SkeletonField md={4} />
      </Row>

      <Placeholder as="div" animation="glow" className="mt-4">
        <Placeholder xs={12} className={styles.textarea} />
      </Placeholder>
    </div>
  );
}
