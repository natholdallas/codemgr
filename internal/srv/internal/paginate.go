package internal

import (
	"github.com/natholdallas/natools4go/orms"
)

// Paginate returns one page of T sorted by a validated column.
//
// The sort is applied eagerly with Order instead of Scopes. GORM executes
// scopes lazily while the statement runs, so an orms.Sorter scope also lands on
// the COUNT query, and PostgreSQL rejects "SELECT count(*) ... ORDER BY col"
// with SQLSTATE 42803 (the column is neither grouped nor aggregated). The
// resulting error used to be swallowed, so every list came back as total 0.
func Paginate[T any](q *orms.Query[T], sort orms.Sorter, page orms.Pagination) (orms.Page[T], error) {
	if sort.Valid() {
		q = q.Order(sort.ToOrderBy())
	}
	v, tx := q.Paginate(page)
	if tx.Error != nil {
		return orms.Page[T]{}, tx.Error
	}
	return v, nil
}
