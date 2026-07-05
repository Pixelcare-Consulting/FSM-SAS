import React from 'react';
import { Table, Button, Form, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { BsTrash } from 'react-icons/bs';

const JobTask = ({
  tasks = [],
  addTask,
  handleTaskChange,
  handleCheckboxChange,
  deleteTask,
  requireFields = true,
}) => {
  const RequiredFieldWithTooltip = ({ label }) => (
    <span>
      {label}
      {requireFields ? (
        <OverlayTrigger
          placement="top"
          overlay={<Tooltip>This field is required</Tooltip>}
        >
          <span className="text-danger" style={{ marginLeft: '4px', cursor: 'help' }}>*</span>
        </OverlayTrigger>
      ) : null}
    </span>
  );

  return (
    <Form noValidate>
      <h5 className="mb-3">
        Job Tasks
        {requireFields ? (
          <OverlayTrigger
            placement="top"
            overlay={<Tooltip>At least one task is required</Tooltip>}
          >
            <span className="text-danger" style={{ marginLeft: '4px', cursor: 'help' }}>*</span>
          </OverlayTrigger>
        ) : null}
      </h5>
      <Button variant="primary" onClick={addTask}>
        Add Task
      </Button>

      {tasks.length === 0 ? (
        <div className="text-center text-muted p-3 mt-3">
          <p>No tasks added yet. Click "Add Task" to begin.</p>
        </div>
      ) : (
        <Table striped bordered hover className="mt-3">
          <thead>
            <tr>
              <th>Delete</th>
              <th>
                <RequiredFieldWithTooltip label="Task Name" />
              </th>
              <th>
                <RequiredFieldWithTooltip label="Task Description" />
              </th>
              <th>Task Complete</th>
              <th>Priority Task</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task, index) => (
              <tr key={index}>
                <td>
                  <Button variant="danger" onClick={() => deleteTask(index)}>
                    <BsTrash />
                  </Button>
                </td>
                <td>
                  <Form.Control
                    type="text"
                    value={task.taskName}
                    onChange={(e) =>
                      handleTaskChange(index, "taskName", e.target.value)
                    }
                    placeholder="Enter task name"
                    required={requireFields}
                  />
                </td>
                <td>
                  <Form.Control
                    as="textarea"
                    value={task.taskDescription}
                    onChange={(e) =>
                      handleTaskChange(index, "taskDescription", e.target.value)
                    }
                    placeholder="Enter task description"
                    required={requireFields}
                  />
                </td>
                <td className="text-center">
                  <Form.Check
                    type="checkbox"
                    checked={task.isDone}
                    onChange={() => handleCheckboxChange(index, "isDone")}
                  />
                </td>
                <td className="text-center">
                  <Form.Check
                    type="checkbox"
                    checked={task.isPriority}
                    onChange={() => handleCheckboxChange(index, "isPriority")}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Form>
  );
};

export default JobTask;
