const CAHCards = (function() {
    let rawData = null;

    // Fisher-Yates Shuffle
    function shuffleArray(array) {
        let currentIndex = array.length, randomIndex;
        while (currentIndex !== 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
    }

    async function loadData() {
        if (!rawData) {
            try {
                const response = await fetch('cah-all-full-pt.json');
                rawData = await response.json();
            } catch (err) {
                console.error("Failed to load cards JSON", err);
                throw err;
            }
        }
        return rawData;
    }

    async function loadPacks() {
        const data = await loadData();
        return data.map((pack, index) => ({
            index: index,
            name: pack.name,
            whiteCount: pack.white ? pack.white.length : 0,
            blackCount: pack.black ? pack.black.length : 0
        }));
    }

    async function getDecks(selectedPackIndices) {
        const data = await loadData();
        let whiteCards = [];
        let blackCards = [];

        selectedPackIndices.forEach(idx => {
            const pack = data[idx];
            if (pack) {
                if (pack.white) {
                    whiteCards = whiteCards.concat(pack.white);
                }
                if (pack.black) {
                    blackCards = blackCards.concat(pack.black);
                }
            }
        });

        return {
            white: shuffleArray(whiteCards),
            black: shuffleArray(blackCards)
        };
    }

    return {
        loadPacks,
        getDecks,
        shuffleArray
    };
})();
