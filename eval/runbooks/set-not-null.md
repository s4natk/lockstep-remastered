SET NOT NULL scans existing rows to prove none are null. The scan locks writes until it finishes. Add a check constraint first when the table is large.
