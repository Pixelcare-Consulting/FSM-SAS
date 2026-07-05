// import node module libraries
import { Row, Col, Form } from 'react-bootstrap';
import TablePagination from 'components/common/TablePagination';

const Pagination = ({
	rowsPerPage,
	rowCount,
	onChangePage,
	onChangeRowsPerPage, // available but not used here
	currentPage
}) => {
	const rangeStart = currentPage === 1 ? 1 : ((currentPage - 1) * rowsPerPage) + 1;
	const rangeEnd = Math.min((currentPage) * rowsPerPage, rowCount);

	function getNumberOfPages(rowCount, rowsPerPage) {
		return Math.ceil(rowCount / rowsPerPage);
	}

	const totalPages = getNumberOfPages(rowCount, rowsPerPage);

	const RecordsPerPageDropDown = ({ paginationRowsPerPageOptions, onChangeRowsPerPage, rowsPerPage }) => {
		return (
			<div className='d-flex flex-row align-content-center'>
				<span className='me-2 mt-2'>Show{' '}</span>
				<Form.Select
					value={rowsPerPage}
					className='w-50'
					onChange={e => onChangeRowsPerPage(Number(e.target.value))}>
					{paginationRowsPerPageOptions.map((option, index) => (
						<option key={index} value={option}>
							{option}
						</option>
					))}
				</Form.Select>
				<span className='ms-2 mt-2'>entries.</span>
			</div>
		);
	};

	return (
		<Row className='mt-4'>
			<Col sm={12} md={5}>
				<div className='p-3 d-flex flex-row align-content-center' >
					<span className='me-3 mt-2'>
						Showing {rangeStart} to {rangeEnd} of {rowCount} entries
					</span>

					<span>
						<RecordsPerPageDropDown
							paginationRowsPerPageOptions={[5, 10, 15, 20, 25, 30]}
							onChangeRowsPerPage={onChangeRowsPerPage}
							rowsPerPage={rowsPerPage}
						/>
					</span>
				</div>
			</Col>
			<Col sm={12} md={7} className='pe-5' >
				<div className='d-flex align-items-center justify-content-end'>
					<TablePagination
						currentPage={currentPage}
						totalPages={totalPages}
						totalItems={rowCount}
						onPageChange={onChangePage}
					/>
				</div>
			</Col>
		</Row>

	);
};

export default Pagination;