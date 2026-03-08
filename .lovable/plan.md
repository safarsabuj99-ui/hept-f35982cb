

# Delete Mistaken Transaction and Payment Request

## What
Remove the erroneous $574.06 credit transaction and its associated approved payment request for client `c2c71442-78bc-455f-8f8d-82ca8ef2d4b6`.

## Records to Delete
1. **Transaction**: `0c243c7b-8b22-4dcb-9300-6a360a9158e2` — Credit $574.06, "Payment: ৳86,109 via Bank (Rate: 150)"
2. **Payment Request**: `3446a19d-eb8a-400d-b754-e17a351e88ac` — ৳86,109, status: approved

## How
- Use the database insert tool to `DELETE` both records
- No code changes needed — this is a data-only fix
- After deletion, the client's Meta balance will drop by $574.06 (removing the mistaken credit), making it reflect the true balance

