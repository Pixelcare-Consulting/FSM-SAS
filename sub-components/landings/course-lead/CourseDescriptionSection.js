// import node module libraries
import { Container, Row, Col } from 'react-bootstrap';

// import widget/custom components
import { SectionHeadingCenter }  from 'widgets';

// import sub components
import CourseDescriptionCard from './CourseDescriptionCard';

// import data files
import { CourseDescriptionList } from 'data/courses/LeadCourseData';

const CourseDescriptionSection = () => {
	const title = 'What will you learn?';
	const subtitle = 'Course Description';
	const description = `Vanilla JS is a fast, lightweight, cross-platformframework for building incredible, powerful JavaScript applications.`;

	return (
		<section className="py-8 py-lg-18 bg-light">
			<Container>
				<SectionHeadingCenter
					title={title}
					description={description}
					subtitle={subtitle}
				/>
				<Row>
					{CourseDescriptionList.map((item) => (
						<Col lg={6} sm={12} key={item.id}>
							<CourseDescriptionCard item={item} />
						</Col>
					))}
				</Row>
			</Container>
		</section>
	);
};
export default CourseDescriptionSection;
