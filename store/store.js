import { configureStore } from '@reduxjs/toolkit';
import appSlice from 'store/appSlice';
import chatSlice from 'store/chatSlice';
import taskKanbanSlice from 'store/taskKanbanSlice';
import mailSlice from 'store/mailSlice'; // Added in v2.1.0
import cartSlice from 'store/cartSlice'; // Added in v2.2.0

export const store = configureStore({
  reducer: {
    app: appSlice,
    chat: chatSlice,
    kanban: taskKanbanSlice,
    mail: mailSlice,
    cart: cartSlice,
  },
})