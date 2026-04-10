function isValidRepo(repo) {
    if (!repo.includes('/')) return false;

    const parts = repo.split('/');

    return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
}

// перевіряємо, що repo без "/" не проходить валідацію
test('invalid repo format', () => {
    expect(isValidRepo('react')).toBe(false);
});

// перевіряємо правильний формат owner/repo
test('valid repo format', () => {
    expect(isValidRepo('facebook/react')).toBe(true);
});

// перевіряємо порожній рядок
test('empty repo string', () => {
    expect(isValidRepo('')).toBe(false);
});

// перевіряємо випадок з подвійним слешем (порожня частина)
test('invalid repo with empty part', () => {
    expect(isValidRepo('facebook//react')).toBe(false);
});