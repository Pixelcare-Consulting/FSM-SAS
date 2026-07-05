import React from "react";
import Link from "next/link";
import { Container, Row, Col, Card } from "react-bootstrap";
import { DashboardHeader } from "sub-components";
import {
  FaExternalLinkAlt,
  FaInfoCircle,
  FaBook,
  FaLink,
} from "react-icons/fa";
import { SUPPORT_HELP_DESK_URL } from "../../../utils/constants";
import HelpTipsAccordion from "./_components/HelpTipsAccordion";
import HelpFaqAccordion from "./_components/HelpFaqAccordion";
import HelpNavigationMap from "./_components/HelpNavigationMap";
import HelpRoleGuide from "./_components/HelpRoleGuide";
import HelpWorkflows from "./_components/HelpWorkflows";
import {
  HELP_TIPS,
  HELP_FAQ_CATEGORIES,
  NAVIGATION_SECTIONS,
  ROLE_GUIDE,
  WORKFLOW_STEPS,
  QUICK_LINKS,
} from "@/content/help/helpContent";
import styles from "./help.module.css";

const HelpPage = () => {
  return (
    <>
      <DashboardHeader
        title="Help & support"
        subtitle="Navigation guide, role tips, workflows, and FAQs for the FSM portal"
      />
      <Container fluid className="mb-6">
        <Row>
          <Col lg={8} md={12} className={styles.mainCol}>
            <div className={styles.workflowNotification} role="status">
              <FaInfoCircle className={styles.workflowNotificationIcon} aria-hidden />
              <div className={styles.workflowNotificationContent}>
                <span className={styles.workflowNotificationTitle}>Portal workflow tips</span>
                <span className={styles.workflowNotificationText}>
                  Use the navigation map and role guide below, then expand tips and FAQs for each area.
                </span>
              </div>
            </div>

            <HelpNavigationMap sections={NAVIGATION_SECTIONS} />
            <HelpRoleGuide roles={ROLE_GUIDE} />
            <HelpWorkflows workflows={WORKFLOW_STEPS} />

            <div className={styles.sectionBlock} role="region" aria-labelledby="tips-heading">
              <h2 id="tips-heading" className={styles.sectionTitle}>
                <FaInfoCircle className={styles.sectionTitleIcon} aria-hidden />
                Feature tips
              </h2>
              <p className={styles.sectionIntro}>
                Tips grouped by portal area. Expand a section to see quick links and guidance.
              </p>
              <HelpTipsAccordion sections={HELP_TIPS} />
            </div>

            <div className={styles.sectionBlock} role="region" aria-labelledby="faq-heading">
              <h2 id="faq-heading" className={styles.sectionTitle}>
                <FaBook className={styles.sectionTitleIcon} aria-hidden />
                Frequently asked questions
              </h2>
              <p className={styles.sectionIntro}>
                Common questions about using the portal, grouped by topic.
              </p>
              {HELP_FAQ_CATEGORIES.map((category) => {
                const Icon = category.icon;
                return (
                  <div
                    key={category.id}
                    className={styles.faqCategory}
                    role="region"
                    aria-labelledby={`faq-cat-${category.id}`}
                  >
                    <h3 id={`faq-cat-${category.id}`} className={styles.faqCategoryTitle}>
                      <Icon className={styles.faqCategoryIcon} aria-hidden />
                      {category.title}
                    </h3>
                    <HelpFaqAccordion items={category.items} />
                  </div>
                );
              })}
            </div>

            <p className={styles.footerNote}>
              Internal staff: the full end-user guide is maintained at{" "}
              <code>docs/END_USER_GUIDE.md</code> in the project repository for training and customer documentation.
            </p>
          </Col>

          <Col lg={4} md={12} className={styles.sidebarCol}>
            <Card className={styles.quickLinksCard}>
              <Card.Header className={styles.quickLinksHeader}>
                <FaLink className={styles.quickLinksHeaderIcon} aria-hidden />
                Quick links
              </Card.Header>
              <Card.Body className={styles.quickLinksBody}>
                <ul className={styles.quickLinksList}>
                  {QUICK_LINKS.map((item) => (
                    <li key={item.href} className={styles.quickLinksItem}>
                      <Link href={item.href} className={styles.quickLinksLink}>
                        {item.label}
                      </Link>
                      <span className={styles.quickLinksDesc}>{item.description}</span>
                    </li>
                  ))}
                </ul>
              </Card.Body>
            </Card>

            <Card className={styles.supportCard}>
              <Card.Header className={styles.supportHeader}>
                Contact support
              </Card.Header>
              <Card.Body className={styles.supportBody}>
                <p className={styles.supportText}>
                  Need more help? Open the help desk to submit a ticket or browse knowledge base articles.
                </p>
                <a
                  href={SUPPORT_HELP_DESK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.supportButton}
                >
                  <FaExternalLinkAlt />
                  Open help desk
                </a>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </>
  );
};

export default HelpPage;
