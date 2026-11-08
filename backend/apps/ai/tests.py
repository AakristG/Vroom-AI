from django.test import SimpleTestCase

from .assistant import _plain


class PlainReplyTests(SimpleTestCase):
    def test_sentence_dashes_become_commas(self):
        self.assertEqual(_plain("You owe more \u2014 about $221."), "You owe more, about $221.")
        self.assertEqual(_plain("Refinance - or extend."), "Refinance, or extend.")
        self.assertEqual(_plain("Lower\u2014but longer."), "Lower, but longer.")

    def test_semicolons_become_sentences(self):
        self.assertEqual(_plain("It is lower; you pay longer."), "It is lower. You pay longer.")

    def test_word_hyphens_ranges_and_negatives_kept(self):
        text = "Trade-in equity is -$221 for 2020\u20132024 models."
        self.assertEqual(_plain(text), text)
