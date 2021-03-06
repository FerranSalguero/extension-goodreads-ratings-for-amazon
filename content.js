var startTime = Date.now();
var intervalsPassed = 0;
var parser = new DOMParser();
/**
 * Search for the Amazon identification number
 */
function getASIN()
{
    var asin = document.querySelectorAll('[data-detailpageasin]')[0];
    if (asin !== undefined)
    {
        asin = asin.getAttribute('data-detailpageasin');
    }
    else
    {
        // ASIN not found (not Amazon.com), search again by hidden input
        asin = document.querySelectorAll("input[name*=ASIN]")[0].value;
        if (asin === undefined || asin.length === 0 || asin.trim() === "")
        {
            console.log("GoodreadsForAmazon: ASIN not found");
            return false;
        }
    }
    return asin;
}
/**
 * ISBN-10 to ISBN-13 conversor
 * http://www.dispersiondesign.com/articles/isbn/converting_isbn10_to_isbn13
 */
function isbn10to13(isbn10)
{
    // Get every char into an array
    var chars = isbn10.split("");
    // Prepend 978 code
    chars.unshift("9", "7", "8");
    // Remove last check digit from isbn10
    chars.pop();
    // Convert to isbn-13
    var i = 0;
    var sum = 0;
    for (i = 0; i < 12; i++)
    {
        sum += chars[i] * ((i % 2) ? 3 : 1);
    }
    var check_digit = (10 - (sum % 10)) % 10;
    chars.push(check_digit);
    // Array back to string
    var isbn13 = chars.join("");
    // Conversion failed?
    if (isbn13.indexOf("NaN") !== -1)
    {
        isbn13 = "";
    }
    return isbn13;
}
/**
 * Sanitizer, removes all html tags, leave text
 */
var tagBody = '(?:[^"\'>]|"[^"]*"|\'[^\']*\')*';
var tagOrComment = new RegExp('<(?:'
    // Comment body.
    + '!--(?:(?:-*[^->])*--+|-?)'
    // Special "raw text" elements whose content should be elided.
    + '|script\\b' + tagBody + '>[\\s\\S]*?</script\\s*' + '|style\\b' + tagBody + '>[\\s\\S]*?</style\\s*'
    // Regular name
    + '|/?[a-z]' + tagBody + ')>', 'gi');

function removeTags(html)
{
    var oldHtml;
    do {
        oldHtml = html;
        html = html.replace(tagOrComment, '');
    } while (html !== oldHtml);
    return html.replace(/</g, '&lt;');
}
/**
 * Get book reviews from ASIN number and show rating
 * last = boolean. Checks if is the last recursive pass
 */
function retrieveBookInfo(asin, last)
{
    //console.log("Book found in " + (Date.now() - startTime) + " ms");
    var urlGoodreads = "https://www.goodreads.com/book/isbn?isbn=" + asin;
    fetch(urlGoodreads).then((resp) => resp.text()).then(function(data)
    {
        var doc = parser.parseFromString(data, "text/html");
        // GET RATINGS INFO
        var meta = doc.querySelectorAll("#bookMeta");
        if (meta.length === 0)
        {
            //console.log("GoodreadsForAmazon: Goodreads meta info not found for ASIN = " + asin);
            // Check once more with isbn13
            if (last === false)
            {
                asin = isbn10to13(asin);
                if (asin !== "")
                {
                    retrieveBookInfo(asin, true);
                }
            }
            return;
        }
        meta = meta[0];
        //console.log("found book with asin: " + asin);
        // CREATE TAGS FOR AMAZON
        // Append content
        var parentSpan = "<br/><span id='goodreadsRating' class='goodreadsRating'>";
        // Stars
        var stars = meta.querySelectorAll(".stars")[0];
        if (stars === undefined || stars === null)
        {
            console.log("Cannot find '.stars' info on page");
            return;
        }
        // Create manually to avoid injection
        parentSpan += "<span class='stars staticStars'>";
        for (var i = 0; i < stars.children.length; i++)
        {
            parentSpan += "<span class='" + stars.children[i].className + "' size=12x12></span>";
        }
        parentSpan += "</span>";
        // Spacing
        parentSpan += "<span class='a-letter-space'></span><span class='a-letter-space'></span>";
        // Review count and link to Goodreads
        var averageHtml = meta.querySelectorAll(".average")[0].textContent;
        var votesHtml = meta.querySelectorAll(".votes")[0].textContent;
        // Clean html 
        var reviewCount = removeTags(averageHtml).trim() + " from " + removeTags(votesHtml).trim() + " ratings";
        parentSpan += "<a href='" + urlGoodreads + "'>" + reviewCount + "</a>";
        // APPEND TO AMAZON PAGE
        // Get reviews section
        // NOTE: Amazon is a mess, usually #averageCusomerReviews exists, but sometimes it won't use it
        // and put the reviews link into #cmrsSummary-popover
        var amazonReview = document.querySelectorAll("#cmrs-atf, #acrCustomerReviewLink");
        if (amazonReview.length !== 0)
        {
            amazonReview = amazonReview[0].parentNode;
        }
        else
        {
            // console.log("GoodreadsForAmazon: #cmrs-atf or #acrCustomerReviewLink not found. Trying with #averageCusomerReviews");
            amazonReview = document.querySelectorAll("#averageCustomerReviews");
        }
        // If not found is not .com and uses different html ¬¬
        if (amazonReview.length === 0)
        {
            var amazonReview = document.querySelectorAll(".buying .crAvgStars");
            // No crAvgStars, search .buying inside .buying (yes, wtf)
            if (amazonReview.length === 0)
            {
                // console.log("GoodreadsForAmazon: .crAvgStars not found. Trying with .buying");
                // Here we go... holy shit Amazon, please define the different parts of your pages properly
                amazonReview = document.querySelectorAll(".buying .tiny a");
                if (amazonReview.length !== 0)
                {
                    amazonReview = amazonReview[0].parentNode
                }
            }
        }
        if (amazonReview[0] !== undefined)
        {
            amazonReview = amazonReview[0];
        }
        parentSpan += "</span>";
        // Parse into html object and select goodreadsRating
        var spanObject = parser.parseFromString(parentSpan, "text/html").querySelector("#goodreadsRating");
        // Append to reviews
        amazonReview.appendChild(spanObject);
    });
}
/**
 * Check if the current article is a book in any form
 */
function checkIfBook()
{
    return document.getElementById("booksTitle") !== null ? true : false;
}
/**
 * START POINT
 */
// Try to get the book info as soon as possible
var asinFound = false;
if (checkIfBook())
{
    var asinChecker = window.setInterval(function()
    {
        intervalsPassed++;
        // console.log("Inverval number " + intervalsPassed);
        var asin = getASIN();
        if (asin !== false)
        { // ASIN found
            window.clearInterval(asinChecker);
            asinFound = true; // No need to check anymore
            retrieveBookInfo(asin, false);
        }
    }, 200);
    /**
     * After loading page check if ASIN was found or try once more
     */
    $(document).ready(function()
    {
        // console.log("Page loaded in " + (Date.now() - startTime) + " ms");
        if (!asinFound)
        {
            // Always remove interval (if ASIN not found, should exists)
            window.clearInterval(asinChecker);
            var asin = getASIN();
            if (asin !== false)
            { // ASIN found
                retrieveBookInfo(asin, false);
            }
            else
            {
                // console.log("Book not found. THE END.");
            }
        }
    });
}