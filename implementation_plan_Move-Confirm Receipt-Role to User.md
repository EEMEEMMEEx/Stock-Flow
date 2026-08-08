# Move "Confirm Receipt" Role to User

This plan outlines the steps to allow the requester (User) to confirm receipt of goods, and adds UI indicators for the Admin to see if a user hasn't confirmed receipt yet.

> [!WARNING]
> **User Review Required: Database Policy Update**
> Since the database currently strictly forbids normal users from updating orders, **you will need to run a SQL command** in your Supabase SQL Editor to allow users to change the status of their own orders to "completed".

## 1. Database Policy Update (Manual Action Required)
You will need to go to your **Supabase Dashboard -> SQL Editor**, and run the following command:

```sql
CREATE POLICY "Users can complete their own orders" 
ON public.withdrawal_orders 
FOR UPDATE 
USING (auth.uid() = requested_by)
WITH CHECK (status = 'completed');
```
*(คำสั่งนี้จะปลดล็อกให้ User สามารถเปลี่ยนสถานะบิลของตัวเองเป็น 'completed' ได้เท่านั้น)*

## 2. Proposed Code Changes

### `src/pages/Withdrawals.jsx`
- **[MODIFY]**: Create a new function `handleUserConfirmReceipt` that bypasses the `isAdmin` check, allowing the requester to update the status to `completed` and set `completed_at`.
- **[MODIFY]**: Change the condition for the "ยืนยันการรับของแล้ว" button from `{isAdmin ...}` to `{selectedOrder?.requested_by === profile.id && selectedOrder?.status === 'approved' ...}` so it appears for the User instead of Admin.
- **[MODIFY]**: Change the status badge text for `approved` to display as "อนุมัติแล้ว (รอผู้รับยืนยัน)" instead of just "APPROVED", so the Admin can clearly see who hasn't picked up the items yet.

### `src/pages/History.jsx`
- **[MODIFY]**: Apply the same status badge text change ("อนุมัติแล้ว (รอผู้รับยืนยัน)") so it's consistent across the system.
- **[MODIFY]**: Show the "ยืนยันการรับของแล้ว" button for the User in the History Details modal as well, so users can confirm receipt from their history page.

## 3. Verification Plan
1. I will apply the code changes.
2. You will run the SQL command in Supabase.
3. You will test by logging in as a Staff member, checking an 'approved' bill, and clicking "ยืนยันการรับของแล้ว". The status should successfully change to "COMPLETED".
