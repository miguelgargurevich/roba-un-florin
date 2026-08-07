namespace Florin.Application.Common;

public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize)
{
    public int TotalPages => PageSize <= 0 ? 0 : (int)Math.Ceiling((double)Total / PageSize);

    public static (int page, int size) Normalize(int page, int pageSize, int maxSize = 100)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? 10 : pageSize > maxSize ? maxSize : pageSize;
        return (page, pageSize);
    }
}
