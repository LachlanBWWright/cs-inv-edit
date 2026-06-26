package operations

type Queue struct {
	items []Receipt
}

func NewQueue() *Queue { return &Queue{} }

func (q *Queue) Enqueue(receipt Receipt) {
	q.items = append(q.items, receipt)
}

func (q *Queue) List() []Receipt {
	return append([]Receipt(nil), q.items...)
}
